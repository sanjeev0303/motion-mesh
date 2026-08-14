package billing

import (
	"context"

	"github.com/motionmesh/server/shared/models"
)

// BillingRepository is defined at the consumer (service layer).
type BillingRepository interface {
	GetAccountByID(ctx context.Context, id string) (*models.Account, error)
	GetAccountByStripeCustomerID(ctx context.Context, customerID string) (*models.Account, error)
	UpdatePlan(ctx context.Context, accountID, plan, status string) error
	RecordUsageEvent(ctx context.Context, event *models.UsageEvent) error
	GetAggregatedUsage(ctx context.Context, accountID, eventType string) (int64, error)
	AddFunds(ctx context.Context, accountID string, amount int64) (int64, error)
	UpdateStripeCustomerID(ctx context.Context, accountID, customerID string) error
}
