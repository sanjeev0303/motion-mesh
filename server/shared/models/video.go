package models

import "time"

type VideoStatus string

const (
	VideoStatusQueued     VideoStatus = "queued"
	VideoStatusProcessing VideoStatus = "processing"
	VideoStatusReady      VideoStatus = "ready"
	VideoStatusFailed     VideoStatus = "failed"
)

type Video struct {
	ID           string      `json:"id" db:"id"`
	AccountID    string      `json:"account_id" db:"account_id"`
	BucketID          string      `json:"bucket_id" db:"bucket_id"`
	TranscodeBucketID *string     `json:"transcode_bucket_id" db:"transcode_bucket_id"`
	ObjectKey         string      `json:"object_key" db:"object_key"`
	ThumbnailKey *string     `json:"thumbnail_key" db:"thumbnail_key"`
	SpriteKey    *string     `json:"sprite_key" db:"sprite_key"`
	PreviewKey   *string     `json:"preview_key" db:"preview_key"`
	Title          string      `json:"title" db:"title"`
	Status         VideoStatus `json:"status" db:"status"`
	CaptionsStatus string      `json:"captions_status" db:"captions_status"`
	Duration       float64     `json:"duration" db:"duration"`
	SizeBytes      float64     `json:"size_bytes" db:"size_bytes"`
	ExternalUserID *string     `json:"external_user_id" db:"external_user_id"`
	CreatedAt      time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at" db:"updated_at"`
}

type Chapter struct {
	ID               string    `json:"id" db:"id"`
	VideoID          string    `json:"video_id" db:"video_id"`
	StartTimeSeconds float64   `json:"start_time_seconds" db:"start_time_seconds"`
	Title            string    `json:"title" db:"title"`
	Position         int       `json:"position" db:"position"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
}

type Rendition struct {
	ID         string    `json:"id" db:"id"`
	VideoID    string    `json:"video_id" db:"video_id"`
	Resolution string    `json:"resolution" db:"resolution"`
	ObjectKey  string    `json:"object_key" db:"object_key"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

type CaptionTrack struct {
	ID        string    `json:"id" db:"id"`
	VideoID   string    `json:"video_id" db:"video_id"`
	Language  string    `json:"language" db:"language"`
	ObjectKey string    `json:"object_key" db:"object_key"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}
