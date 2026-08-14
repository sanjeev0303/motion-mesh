package branding

import (
	"context"
	"fmt"

	"github.com/motionmesh/server/shared/models"
	sharedbranding "github.com/motionmesh/server/shared/branding"
)

// Service handles watermark configuration for pro-tier accounts.
// Plan enforcement happens at the handler layer (RequirePlan middleware);
// this service only cares about the business logic.
type Service struct {
	repo    sharedbranding.BrandingRepository
	storage ObjectStorage
}

func NewService(repo sharedbranding.BrandingRepository, storage ObjectStorage) *Service {
	return &Service{repo: repo, storage: storage}
}

func (s *Service) GetWatermark(ctx context.Context, accountID string) (*models.WatermarkMetadata, error) {
	return s.repo.GetActiveWatermark(ctx, accountID)
}

func (s *Service) UpdateWatermark(ctx context.Context, accountID, position string, opacity float32) (*models.WatermarkMetadata, error) {
	existing, err := s.repo.GetActiveWatermark(ctx, accountID)
	if err != nil {
		return nil, err
	}

	w := &models.WatermarkMetadata{
		AccountID: accountID,
		Position:  position,
		Opacity:   opacity,
		IsActive:  true,
	}
	if existing != nil {
		w.ID = existing.ID
		w.AssetObjectKey = existing.AssetObjectKey
	}
	return s.repo.Upsert(ctx, w)
}

// UploadAsset stores the watermark image and updates the object key reference.
func (s *Service) UploadAsset(ctx context.Context, accountID string, data []byte, contentType string) (*models.WatermarkMetadata, error) {
	key := fmt.Sprintf("watermarks/%s/logo", accountID)
	if err := s.storage.PutObject(ctx, key, data, contentType); err != nil {
		return nil, fmt.Errorf("branding: upload asset: %w", err)
	}

	existing, _ := s.repo.GetActiveWatermark(ctx, accountID)
	w := &models.WatermarkMetadata{
		AccountID:      accountID,
		AssetObjectKey: key,
		Position:       "bottom-right",
		Opacity:        0.8,
		IsActive:       true,
	}
	if existing != nil {
		w.ID = existing.ID
		w.Position = existing.Position
		w.Opacity = existing.Opacity
	}
	return s.repo.Upsert(ctx, w)
}
