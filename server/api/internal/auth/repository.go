package auth

import (
	"context"
	"time"

	"github.com/motionmesh/server/shared/models"
)

// AccountRepository is defined here, at the consumer (service layer).
// The concrete Postgres implementation lives in postgres/repository.go.
type AccountRepository interface {
	FindByClerkUserID(ctx context.Context, clerkUserID string) (*models.Account, error)
	FindByClerkOrgID(ctx context.Context, clerkOrgID string) (*models.Account, error)
	FindByAPIKeyPrefix(ctx context.Context, prefix string) (*models.Account, string, error) // returns account + stored hash
	GetByID(ctx context.Context, id string) (*models.Account, error)
	Create(ctx context.Context, account *models.Account) error
	UpsertByClerkUserID(ctx context.Context, clerkUserID, email string) (*models.Account, error)
	UpsertByClerkOrgID(ctx context.Context, clerkOrgID, email string) (*models.Account, error)
	CreateAPIKey(ctx context.Context, key *models.APIKey) error
	ListAPIKeys(ctx context.Context, accountID string) ([]models.APIKey, error)
	RevokeAPIKey(ctx context.Context, accountID, keyID string) (string, error)
	// BatchUpdateLastUsed sets last_used_at in bulk for the given key prefixes.
	// keys maps api_key.prefix → the timestamp to write.
	BatchUpdateLastUsed(ctx context.Context, keys map[string]time.Time) error
}
