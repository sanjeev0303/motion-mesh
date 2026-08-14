package videos

import (
	"context"

	"github.com/motionmesh/server/shared/models"
)

type VideoRepository interface {
	ListByAccount(ctx context.Context, accountID string, externalUserID *string, limit int, cursor string) ([]*models.Video, error)
	GetByID(ctx context.Context, id, accountID string) (*models.Video, error)
	GetPublicByID(ctx context.Context, id string) (*models.Video, error)
	Delete(ctx context.Context, id, accountID string) error
	Create(ctx context.Context, video *models.Video) (*models.Video, error)
	UpdateStatus(ctx context.Context, id, accountID string, status models.VideoStatus) error
	SetThumbnailKeys(ctx context.Context, id, accountID string, thumbnail, sprite, preview *string) error
}
