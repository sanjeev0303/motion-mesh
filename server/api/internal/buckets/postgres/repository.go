package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/shared/pagination"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) ListByAccount(ctx context.Context, accountID string) ([]*models.Bucket, error) {
	query := `
		SELECT id, account_id, name, created_at, total_bytes, total_objects
		FROM buckets
		WHERE account_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var buckets []*models.Bucket
	for rows.Next() {
		b := &models.Bucket{
			Region:            "us-east-1",           // Mocked default for now
			StorageLimitBytes: 1024 * 1024 * 1024 * 1024, // 1TB default
			EgressLimitBytes:  5 * 1024 * 1024 * 1024 * 1024, // 5TB default
		}
		if err := rows.Scan(&b.ID, &b.AccountID, &b.Name, &b.CreatedAt, &b.StorageUsedBytes, &b.ObjectCount); err != nil {
			return nil, err
		}
		buckets = append(buckets, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return buckets, nil
}

func (r *Repository) CreateBucket(ctx context.Context, bucket *models.Bucket) error {
	query := `
		INSERT INTO buckets (account_id, name)
		VALUES ($1, $2)
		RETURNING id, created_at
	`
	return r.db.QueryRow(ctx, query, bucket.AccountID, bucket.Name).Scan(&bucket.ID, &bucket.CreatedAt)
}

func (r *Repository) UpsertObjects(ctx context.Context, objects []models.BucketObject) error {
	if len(objects) == 0 {
		return nil
	}

	query := `
		INSERT INTO objects (bucket_id, key, size_bytes, content_type)
		SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::bigint[], $4::text[])
		ON CONFLICT (bucket_id, key) DO UPDATE 
		SET size_bytes = EXCLUDED.size_bytes,
		    content_type = EXCLUDED.content_type
	`

	var bucketIDs []string
	var keys []string
	var sizes []int64
	var contentTypes []string

	for _, obj := range objects {
		bucketIDs = append(bucketIDs, obj.BucketID)
		keys = append(keys, obj.Key)
		sizes = append(sizes, obj.SizeBytes)
		contentTypes = append(contentTypes, obj.ContentType)
	}

	_, err := r.db.Exec(ctx, query, bucketIDs, keys, sizes, contentTypes)
	return err
}

func (r *Repository) GetBucketUsage(ctx context.Context, bucketID string) (usedBytes int64, count int, err error) {
	query := `
		SELECT total_bytes, total_objects
		FROM buckets
		WHERE id = $1
	`
	err = r.db.QueryRow(ctx, query, bucketID).Scan(&usedBytes, &count)
	return
}

func (r *Repository) ListObjectsByBucket(ctx context.Context, accountID, bucketID string, limit int, cursor string) ([]*models.BucketObject, error) {
	// Join with buckets to enforce account ownership check
	query := `
		SELECT o.id, o.bucket_id, o.key, o.size_bytes, o.content_type, o.uploaded_at
		FROM objects o
		JOIN buckets b ON b.id = o.bucket_id
		WHERE o.bucket_id = $1 AND b.account_id = $2
	`
	args := []interface{}{bucketID, accountID}

	if cursor != "" {
		c, err := pagination.DecodeCursor[pagination.ObjectCursor](cursor)
		if err != nil {
			return nil, err
		}
		query += ` AND (o.uploaded_at, o.id) < ($3, $4) ORDER BY o.uploaded_at DESC, o.id DESC LIMIT $5`
		args = append(args, c.UploadedAt, c.ID, limit)
	}

	if len(args) == 2 {
		query += ` ORDER BY o.uploaded_at DESC, o.id DESC LIMIT $3`
		args = append(args, limit)
	}

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var objects []*models.BucketObject
	for rows.Next() {
		obj := &models.BucketObject{}
		if err := rows.Scan(&obj.ID, &obj.BucketID, &obj.Key, &obj.SizeBytes, &obj.ContentType, &obj.UploadedAt); err != nil {
			return nil, err
		}
		objects = append(objects, obj)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return objects, nil
}
