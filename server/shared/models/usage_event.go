package models

import "time"

type UsageEvent struct {
	ID        string            `json:"id" db:"id"`
	EventID   string            `json:"event_id,omitempty" db:"event_id"` // stable per-delivery key for ON CONFLICT dedup
	AccountID string            `json:"account_id" db:"account_id"`
	EventType string            `json:"event_type" db:"event_type"` // "storage_bytes" | "transcode_minutes" | "bandwidth_bytes"
	Quantity  int64             `json:"quantity" db:"quantity"`
	Metadata  map[string]string `json:"metadata,omitempty" db:"metadata"`
	CreatedAt time.Time         `json:"created_at" db:"created_at"`
}
