package models

import "time"

type JobStatus string

const (
	JobStatusQueued     JobStatus = "queued"
	JobStatusProcessing JobStatus = "processing"
	JobStatusCompleted  JobStatus = "completed"
	JobStatusFailed     JobStatus = "failed"
)

type Job struct {
	ID              string    `json:"id" db:"id"`
	VideoID         string    `json:"video_id" db:"video_id"`
	Status          JobStatus `json:"status" db:"status"`
	ProgressPercent int       `json:"progress_percent" db:"progress_percent"`
	ErrorMsg        *string   `json:"error_msg" db:"error_msg"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}
