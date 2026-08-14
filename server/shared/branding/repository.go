package branding

import (
	"context"

	"github.com/motionmesh/server/shared/models"
)

// BrandingRepository defines the data access methods for branding features.
type BrandingRepository interface {
	GetActiveWatermark(ctx context.Context, accountID string) (*models.WatermarkMetadata, error)
	Upsert(ctx context.Context, w *models.WatermarkMetadata) (*models.WatermarkMetadata, error)
}
