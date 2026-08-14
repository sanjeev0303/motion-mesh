package models

import "time"

// BucketObject represents a single file tracked in the objects table.
// One row per file written to object storage — source uploads, HLS segments,
// captions, thumbnails, etc. Used for Bucket UI display and storage billing.
type BucketObject struct {
	ID          string    `json:"id"`
	BucketID    string    `json:"bucketId"`
	Key         string    `json:"key"`
	SizeBytes   int64     `json:"sizeBytes"`
	ContentType string    `json:"contentType"`
	UploadedAt  time.Time `json:"uploadedAt"`
}
