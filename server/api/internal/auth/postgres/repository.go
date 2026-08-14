package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/shared/models"
)

// Repository is the Postgres implementation of auth.AccountRepository.
// It imports pgxpool here — the service layer never touches this file.
type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindByClerkUserID(ctx context.Context, clerkUserID string) (*models.Account, error) {
	var acc models.Account
	err := r.db.QueryRow(ctx,
		`SELECT id, email, clerk_user_id, clerk_org_id, plan, status, balance, created_at, updated_at
		 FROM accounts WHERE clerk_user_id = $1`,
		clerkUserID,
	).Scan(&acc.ID, &acc.Email, &acc.ClerkUserID, &acc.ClerkOrgID, &acc.Plan, &acc.Status, &acc.Balance, &acc.CreatedAt, &acc.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &acc, err
}

func (r *Repository) FindByClerkOrgID(ctx context.Context, clerkOrgID string) (*models.Account, error) {
	var acc models.Account
	err := r.db.QueryRow(ctx,
		`SELECT id, email, clerk_user_id, clerk_org_id, plan, status, balance, created_at, updated_at
		 FROM accounts WHERE clerk_org_id = $1`,
		clerkOrgID,
	).Scan(&acc.ID, &acc.Email, &acc.ClerkUserID, &acc.ClerkOrgID, &acc.Plan, &acc.Status, &acc.Balance, &acc.CreatedAt, &acc.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &acc, err
}

func (r *Repository) FindByAPIKeyPrefix(ctx context.Context, prefix string) (*models.Account, string, error) {
	var acc models.Account
	var hash string
	err := r.db.QueryRow(ctx,
		`SELECT a.id, a.email, a.clerk_user_id, a.clerk_org_id, a.plan, a.status, a.balance,
		        a.created_at, a.updated_at, k.hash
		 FROM api_keys k
		 JOIN accounts a ON a.id = k.account_id
		 WHERE k.prefix = $1 AND k.revoked_at IS NULL
		   AND (k.expires_at IS NULL OR k.expires_at > now())`,
		prefix,
	).Scan(&acc.ID, &acc.Email, &acc.ClerkUserID, &acc.ClerkOrgID, &acc.Plan, &acc.Status, &acc.Balance,
		&acc.CreatedAt, &acc.UpdatedAt, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", nil
	}
	return &acc, hash, err
}

func (r *Repository) GetByID(ctx context.Context, id string) (*models.Account, error) {
	var acc models.Account
	err := r.db.QueryRow(ctx,
		`SELECT id, email, clerk_user_id, clerk_org_id, plan, status, balance, created_at, updated_at
		 FROM accounts WHERE id = $1`,
		id,
	).Scan(&acc.ID, &acc.Email, &acc.ClerkUserID, &acc.ClerkOrgID, &acc.Plan, &acc.Status, &acc.Balance, &acc.CreatedAt, &acc.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &acc, err
}

func (r *Repository) Create(ctx context.Context, account *models.Account) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO accounts (id, email, clerk_user_id, clerk_org_id, plan, status, balance)
		 VALUES (gen_random_uuid(), $1, $2, $3, 'free', 'active', 0)`,
		account.Email, account.ClerkUserID, account.ClerkOrgID,
	)
	return err
}

// UpsertByClerkUserID creates the account row on first login if it doesn't exist yet.
func (r *Repository) UpsertByClerkUserID(ctx context.Context, clerkUserID, email string) (*models.Account, error) {
	var acc models.Account
	err := r.db.QueryRow(ctx,
		`INSERT INTO accounts (id, email, clerk_user_id, plan, status, balance)
		 VALUES (gen_random_uuid(), $2, $1, 'free', 'active', 0)
		 ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email
		 RETURNING id, email, clerk_user_id, clerk_org_id, plan, status, balance, created_at, updated_at`,
		clerkUserID, email,
	).Scan(&acc.ID, &acc.Email, &acc.ClerkUserID, &acc.ClerkOrgID, &acc.Plan, &acc.Status, &acc.Balance, &acc.CreatedAt, &acc.UpdatedAt)
	return &acc, err
}

// UpsertByClerkOrgID creates the account row for a Clerk Organization on first login.
func (r *Repository) UpsertByClerkOrgID(ctx context.Context, clerkOrgID, email string) (*models.Account, error) {
	var acc models.Account
	err := r.db.QueryRow(ctx,
		`INSERT INTO accounts (id, email, clerk_org_id, plan, status, balance)
		 VALUES (gen_random_uuid(), $2, $1, 'free', 'active', 0)
		 ON CONFLICT (clerk_org_id) DO UPDATE SET email = EXCLUDED.email
		 RETURNING id, email, clerk_user_id, clerk_org_id, plan, status, balance, created_at, updated_at`,
		clerkOrgID, email,
	).Scan(&acc.ID, &acc.Email, &acc.ClerkUserID, &acc.ClerkOrgID, &acc.Plan, &acc.Status, &acc.Balance, &acc.CreatedAt, &acc.UpdatedAt)
	return &acc, err
}

func (r *Repository) CreateAPIKey(ctx context.Context, key *models.APIKey) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO api_keys (id, account_id, name, prefix, hash, scopes, expires_at)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
		key.AccountID, key.Name, key.Prefix, key.Hash, key.Scopes, key.ExpiresAt,
	)
	return err
}

func (r *Repository) ListAPIKeys(ctx context.Context, accountID string) ([]models.APIKey, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, account_id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at
		 FROM api_keys WHERE account_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
		accountID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []models.APIKey
	for rows.Next() {
		var k models.APIKey
		if err := rows.Scan(&k.ID, &k.AccountID, &k.Name, &k.Prefix, &k.Scopes, &k.LastUsedAt, &k.ExpiresAt, &k.RevokedAt, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

func (r *Repository) RevokeAPIKey(ctx context.Context, accountID, keyID string) (string, error) {
	var prefix string
	err := r.db.QueryRow(ctx,
		`UPDATE api_keys SET revoked_at = now() WHERE account_id = $1 AND id = $2 RETURNING prefix`,
		accountID, keyID,
	).Scan(&prefix)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errors.New("auth: api key not found or unauthorized")
	}
	return prefix, err
}

// BatchUpdateLastUsed sets last_used_at for multiple API keys in a single query.
// keys maps api_key.prefix → the timestamp to write.
// Uses unnest to avoid N round-trips; a single UPDATE ... FROM unnest(...) is safe
// on Postgres 12+ and holds only row-level locks for the affected prefixes.
func (r *Repository) BatchUpdateLastUsed(ctx context.Context, keys map[string]time.Time) error {
	if len(keys) == 0 {
		return nil
	}
	prefixes := make([]string, 0, len(keys))
	times := make([]time.Time, 0, len(keys))
	for prefix, ts := range keys {
		prefixes = append(prefixes, prefix)
		times = append(times, ts)
	}
	_, err := r.db.Exec(ctx,
		`UPDATE api_keys AS k
		 SET last_used_at = v.ts
		 FROM unnest($1::text[], $2::timestamptz[]) AS v(prefix, ts)
		 WHERE k.prefix = v.prefix AND k.revoked_at IS NULL`,
		prefixes, times,
	)
	return err
}
