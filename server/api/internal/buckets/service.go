package buckets

import (
	"context"

	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/shared/storage"
)

type BucketRepository interface {
	ListByAccount(ctx context.Context, accountID string) ([]*models.Bucket, error)
	CreateBucket(ctx context.Context, bucket *models.Bucket) error
	UpsertObjects(ctx context.Context, objects []models.BucketObject) error
	GetBucketUsage(ctx context.Context, bucketID string) (usedBytes int64, count int, err error)
	ListObjectsByBucket(ctx context.Context, accountID, bucketID string, limit int, cursor string) ([]*models.BucketObject, error)
}

type Service struct {
	repo    BucketRepository
	storage storage.ObjectStorage
}

func NewService(repo BucketRepository, store storage.ObjectStorage) *Service {
	return &Service{
		repo:    repo,
		storage: store,
	}
}

func (s *Service) ListBuckets(ctx context.Context, accountID string) ([]*models.Bucket, error) {
	return s.repo.ListByAccount(ctx, accountID)
}

func (s *Service) CreateBucket(ctx context.Context, bucket *models.Bucket) error {
	if err := s.repo.CreateBucket(ctx, bucket); err != nil {
		return err
	}
	return nil
}

func (s *Service) UpsertObjects(ctx context.Context, objects []models.BucketObject) error {
	return s.repo.UpsertObjects(ctx, objects)
}

func (s *Service) GetBucketUsage(ctx context.Context, bucketID string) (usedBytes int64, count int, err error) {
	return s.repo.GetBucketUsage(ctx, bucketID)
}

func (s *Service) ListObjectsByBucket(ctx context.Context, accountID, bucketID string, limit int, cursor string) ([]*models.BucketObject, error) {
	return s.repo.ListObjectsByBucket(ctx, accountID, bucketID, limit, cursor)
}
