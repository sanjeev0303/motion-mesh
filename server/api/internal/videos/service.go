package videos

import (
	"context"

	"github.com/motionmesh/server/shared/models"
)

type Service struct {
	repo VideoRepository
}

func NewService(repo VideoRepository) *Service {
	return &Service{repo: repo}
}

func (s *Service) ListVideos(ctx context.Context, accountID string, externalUserID *string, limit int, cursor string) ([]*models.Video, error) {
	return s.repo.ListByAccount(ctx, accountID, externalUserID, limit, cursor)
}

func (s *Service) GetVideo(ctx context.Context, id, accountID string) (*models.Video, error) {
	return s.repo.GetByID(ctx, id, accountID)
}

func (s *Service) GetPublicVideo(ctx context.Context, id string) (*models.Video, error) {
	return s.repo.GetPublicByID(ctx, id)
}

func (s *Service) DeleteVideo(ctx context.Context, id, accountID string) error {
	return s.repo.Delete(ctx, id, accountID)
}

func (s *Service) InitiateUpload(ctx context.Context, video *models.Video) (*models.Video, error) {
	video.Status = models.VideoStatusQueued
	return s.repo.Create(ctx, video)
}
