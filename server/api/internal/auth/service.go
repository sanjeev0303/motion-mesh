package auth

import (
	"context"
	crypto_rand "crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/jwks"
	"github.com/clerk/clerk-sdk-go/v2/jwt"
	"github.com/motionmesh/server/api/internal/auth/cache"
	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/metrics"
	"github.com/motionmesh/server/shared/models"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
)

var (
	ErrInvalidToken    = errors.New("auth: invalid or expired token")
	ErrInvalidAPIKey   = errors.New("auth: invalid API key")
	ErrAccountNotFound = errors.New("auth: account not found")
)

const (
	// localCacheTTL is the soft TTL for the in-process LRU. Short on purpose:
	// losing entries only falls through to Redis (still warm).
	localCacheTTL = 5 * time.Minute
	// redisCacheTTL is the hard TTL for Redis entries.
	redisCacheTTL = 10 * time.Minute
	// negativeCacheTTL limits hammering from repeatedly invalid keys.
	negativeCacheTTL = 60 * time.Second
)

// Service handles both authentication paths:
//   - Clerk JWTs (dashboard users, networkless JWKS verification)
//   - mot_live_/mot_test_ API keys (SDK / programmatic callers)
//
// Both paths resolve to an *models.Account with a stable account_id.
type Service struct {
	repo       AccountRepository
	jwksClient *jwks.Client
	jwksMu     sync.RWMutex
	cachedJWKS *clerk.JSONWebKeySet
	rdb        *redis.Client
	local      *cache.LocalCache
	sf         singleflight.Group
	log        *logger.Logger
}

func NewService(repo AccountRepository, rdb *redis.Client, secretKey, _ string, log *logger.Logger) *Service {
	clerk.SetKey(secretKey)
	local, _ := cache.NewLocalCache(10_000) // oversized is fine; eviction is LRU
	return &Service{
		repo:       repo,
		rdb:        rdb,
		jwksClient: jwks.NewClient(&clerk.ClientConfig{}),
		local:      local,
		log:        log,
	}
}

// ─── Clerk JWT ────────────────────────────────────────────────────────────────

// VerifyClerkToken validates a Clerk session JWT networklessly using a cached JWKS.
// The JWKS is fetched once on first call; all subsequent verifications use the in-memory cache.
// The org claim is preferred over the user claim to support Clerk Organizations (Teams feature).
func (s *Service) VerifyClerkToken(ctx context.Context, token string) (*models.Account, error) {
	keySet, err := s.getJWKS(ctx)
	if err != nil {
		metrics.AuthFailure.Inc()
		return nil, ErrInvalidToken
	}

	decoded, err := jwt.Decode(ctx, &jwt.DecodeParams{Token: token})
	if err != nil {
		metrics.AuthFailure.Inc()
		return nil, ErrInvalidToken
	}

	var jwk *clerk.JSONWebKey
	for _, k := range keySet.Keys {
		if k.KeyID == decoded.KeyID {
			jwk = k
			break
		}
	}
	if jwk == nil {
		// Key not in cache — refetch once in case keys were rotated.
		s.invalidateJWKS()
		keySet, err = s.getJWKS(ctx)
		if err != nil {
			metrics.AuthFailure.Inc()
			return nil, ErrInvalidToken
		}
		for _, k := range keySet.Keys {
			if k.KeyID == decoded.KeyID {
				jwk = k
				break
			}
		}
	}

	claims, err := jwt.Verify(ctx, &jwt.VerifyParams{
		Token:      token,
		JWK:        jwk,
		JWKSClient: s.jwksClient,
	})
	if err != nil {
		metrics.AuthFailure.Inc()
		return nil, ErrInvalidToken
	}

	// Caching logic for Clerk identities
	var account *models.Account
	var cacheKey string

	if claims.ActiveOrganizationID != "" {
		cacheKey = "mot:auth:clerk_org:" + claims.ActiveOrganizationID
	} else {
		cacheKey = "mot:auth:clerk_user:" + claims.Subject
	}

	// Tier 1: local LRU
	if acc, ok := s.local.Get(cacheKey, ""); ok {
		metrics.AuthLocalHit.Inc()
		return acc, nil
	}

	// Tier 2: Redis
	if acc, invalid, found := s.checkRedis(ctx, cacheKey, ""); found {
		if invalid {
			metrics.AuthFailure.Inc()
			return nil, ErrInvalidToken
		}
		metrics.AuthRedisHit.Inc()
		s.local.Set(cacheKey, acc, "", localCacheTTL)
		return acc, nil
	}

	// Tier 3: Postgres
	metrics.AuthDBFallback.Inc()
	accI, err, _ := s.sf.Do(cacheKey, func() (interface{}, error) {
		if claims.ActiveOrganizationID != "" {
			return s.repo.UpsertByClerkOrgID(ctx, claims.ActiveOrganizationID, "")
		}
		return s.repo.UpsertByClerkUserID(ctx, claims.Subject, "")
	})

	if err != nil || accI == nil {
		metrics.AuthFailure.Inc()
		s.cacheNegative(ctx, cacheKey)
		return nil, ErrInvalidToken
	}

	account = accI.(*models.Account)

	// Populate both cache tiers on success.
	accountJSON, _ := json.Marshal(account)
	s.rdb.HSet(ctx, cacheKey, "account_json", string(accountJSON), "digest", "")
	s.rdb.Expire(ctx, cacheKey, redisCacheTTL)
	s.local.Set(cacheKey, account, "", localCacheTTL)

	return account, nil
}

// ─── API Key (three-tier cache) ───────────────────────────────────────────────

// VerifyAPIKey authenticates mot_live_ or mot_test_ prefixed keys.
// Format: <prefix>.<secret> — prefix stored in DB, secret compared via SHA-256.
//
// Cache tiers (fastest → slowest):
//  1. In-process LRU (localCacheTTL soft TTL)
//  2. Redis hash   (redisCacheTTL hard TTL; "invalid"=1 for negative entries)
//  3. Postgres     (source of truth; populates tiers 1+2 on success)
//
// Any tier error falls through to the next tier — a broken cache degrades
// performance, never auth correctness.
func (s *Service) VerifyAPIKey(ctx context.Context, rawKey string) (*models.Account, error) {
	parts := strings.SplitN(rawKey, ".", 2)
	if len(parts) != 2 {
		metrics.AuthFailure.Inc()
		return nil, ErrInvalidAPIKey
	}
	prefix := parts[0]
	if !strings.HasPrefix(prefix, "mot_live_") && !strings.HasPrefix(prefix, "mot_test_") {
		metrics.AuthFailure.Inc()
		return nil, ErrInvalidAPIKey
	}

	// Compute digest of the secret portion once; used for cache validation.
	incoming := sha256.Sum256([]byte(parts[1]))
	digest := hex.EncodeToString(incoming[:])
	cKey := cache.APIKeyKey(prefix)

	// ── Tier 1: local LRU ────────────────────────────────────────────────────
	if account, ok := s.local.Get(cKey, digest); ok {
		metrics.AuthLocalHit.Inc()
		trackLastUsed(s.rdb, prefix)
		return account, nil
	}

	// ── Tier 2: Redis ─────────────────────────────────────────────────────────
	if account, invalid, found := s.checkRedis(ctx, cKey, digest); found {
		if invalid {
			metrics.AuthFailure.Inc()
			return nil, ErrInvalidAPIKey
		}
		metrics.AuthRedisHit.Inc()
		s.local.Set(cKey, account, digest, localCacheTTL)
		trackLastUsed(s.rdb, prefix)
		return account, nil
	}

	// ── Tier 3: Postgres ──────────────────────────────────────────────────────
	metrics.AuthDBFallback.Inc()
	type apiResult struct {
		account *models.Account
		hash    string
	}
	resI, err, _ := s.sf.Do(prefix, func() (interface{}, error) {
		acc, storedHash, err := s.repo.FindByAPIKeyPrefix(ctx, prefix)
		return apiResult{acc, storedHash}, err
	})
	if err != nil || resI == nil {
		metrics.AuthFailure.Inc()
		s.cacheNegative(ctx, cKey)
		return nil, ErrInvalidAPIKey
	}

	res := resI.(apiResult)
	account := res.account
	storedHash := res.hash

	if account == nil {
		metrics.AuthFailure.Inc()
		s.cacheNegative(ctx, cKey)
		return nil, ErrInvalidAPIKey
	}

	// Constant-time comparison to prevent timing attacks.
	if subtle.ConstantTimeCompare([]byte(digest), []byte(storedHash)) != 1 {
		metrics.AuthFailure.Inc()
		s.cacheNegative(ctx, cKey)
		return nil, ErrInvalidAPIKey
	}

	// Populate both cache tiers on success.
	accountJSON, _ := json.Marshal(account)
	s.rdb.HSet(ctx, cKey, "account_json", string(accountJSON), "digest", digest)
	s.rdb.Expire(ctx, cKey, redisCacheTTL)
	s.local.Set(cKey, account, digest, localCacheTTL)

	trackLastUsed(s.rdb, prefix)
	return account, nil
}

// checkRedis reads the Redis hash for a cached API key entry.
// Returns (account, invalid=false, found=true)   — valid cached entry
//
//	(nil, invalid=true,  found=true)   — negative cache hit
//	(nil, invalid=false, found=false)  — cache miss or Redis error
func (s *Service) checkRedis(ctx context.Context, cKey, digest string) (account *models.Account, invalid bool, found bool) {
	// Only fetch the three fields needed by the authentication path.
	// HGETALL is unnecessarily expensive once the cache entry grows.
	values, err := s.rdb.HMGet(ctx, cKey, "account_json", "digest", "invalid").Result()
	if err != nil {
		if err != redis.Nil {
			s.log.Error("redis error getting %s: %v", cKey, err)
		}
		return nil, false, false
	}
	if len(values) != 3 {
		return nil, false, false
	}

	invalidValue, _ := values[2].(string)
	if invalidValue == "1" {
		return nil, true, true
	}

	storedDigest, _ := values[1].(string)
	if storedDigest == "" || storedDigest != digest {
		// Key material changed (rotation) or the entry is incomplete.
		return nil, false, false
	}

	accJSON, _ := values[0].(string)
	if accJSON == "" {
		return nil, false, false
	}

	var acc models.Account
	if err := json.Unmarshal([]byte(accJSON), &acc); err != nil {
		return nil, false, false
	}
	return &acc, false, true
}

// cacheNegative writes a short-lived "invalid" marker to Redis to blunt repeated
// hammering of a bad key without polluting the long-TTL positive-entry space.
func (s *Service) cacheNegative(ctx context.Context, cKey string) {
	s.rdb.HSet(ctx, cKey, "invalid", "1")
	s.rdb.Expire(ctx, cKey, negativeCacheTTL)
}

// ─── Key management ───────────────────────────────────────────────────────────

func (s *Service) GenerateAPIKey(ctx context.Context, accountID, name string) (string, *models.APIKey, error) {
	// Generate random prefix (8 bytes) and secret (32 bytes)
	prefixBytes := make([]byte, 8)
	secretBytes := make([]byte, 32)
	if _, err := crypto_rand.Read(prefixBytes); err != nil {
		return "", nil, err
	}
	if _, err := crypto_rand.Read(secretBytes); err != nil {
		return "", nil, err
	}

	prefix := "mot_live_" + hex.EncodeToString(prefixBytes)
	secret := hex.EncodeToString(secretBytes)
	rawKey := prefix + "." + secret

	hash := sha256.Sum256([]byte(secret))
	hashHex := hex.EncodeToString(hash[:])

	key := &models.APIKey{
		AccountID: accountID,
		Name:      name,
		Prefix:    prefix,
		Hash:      hashHex,
		Scopes:    []string{"*"}, // Default full scope for now
	}

	if err := s.repo.CreateAPIKey(ctx, key); err != nil {
		return "", nil, err
	}
	return rawKey, key, nil
}

func (s *Service) ListAPIKeys(ctx context.Context, accountID string) ([]models.APIKey, error) {
	return s.repo.ListAPIKeys(ctx, accountID)
}

func (s *Service) RevokeAPIKey(ctx context.Context, accountID, keyID string) error {
	prefix, err := s.repo.RevokeAPIKey(ctx, accountID, keyID)
	if err == nil && prefix != "" {
		cKey := cache.APIKeyKey(prefix)
		// Evict from both cache tiers immediately on revocation.
		s.local.Invalidate(cKey)
		s.rdb.Del(ctx, cKey)
		// Clean up the debounce lock so a re-issued key isn't blocked.
		s.rdb.Del(ctx, fmt.Sprintf("mot:api_key:last_used_lock:%s", prefix))
	}
	return err
}

// ─── JWKS helpers ─────────────────────────────────────────────────────────────

// getJWKS returns the cached JWKS, fetching on first call.
func (s *Service) getJWKS(ctx context.Context) (*clerk.JSONWebKeySet, error) {
	s.jwksMu.RLock()
	if s.cachedJWKS != nil {
		defer s.jwksMu.RUnlock()
		return s.cachedJWKS, nil
	}
	s.jwksMu.RUnlock()

	s.jwksMu.Lock()
	defer s.jwksMu.Unlock()
	if s.cachedJWKS != nil {
		return s.cachedJWKS, nil
	}

	keySet, err := s.jwksClient.Get(ctx, &jwks.GetParams{})
	if err != nil {
		return nil, err
	}
	s.cachedJWKS = keySet
	return s.cachedJWKS, nil
}

// invalidateJWKS clears the cached JWKS to force a refetch on next call.
// Used when a token's kid is not found in cache (key rotation).
func (s *Service) invalidateJWKS() {
	s.jwksMu.Lock()
	s.cachedJWKS = nil
	s.jwksMu.Unlock()
}
