package models

import "time"

type WatermarkMetadata struct {
	ID             string    `json:"id" db:"id"`
	AccountID      string    `json:"account_id" db:"account_id"`
	AssetObjectKey string    `json:"asset_object_key" db:"asset_object_key"`
	Position       string    `json:"position" db:"position"` // "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center"
	Opacity        float32   `json:"opacity" db:"opacity"`   // 0.0 – 1.0
	IsActive       bool      `json:"is_active" db:"is_active"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}
