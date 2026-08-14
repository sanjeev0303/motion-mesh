package models

import "time"

type Account struct {
	ID               string     `json:"id" db:"id"`
	Email            string     `json:"email" db:"email"`
	ClerkUserID      *string    `json:"clerk_user_id,omitempty" db:"clerk_user_id"`
	ClerkOrgID       *string    `json:"clerk_org_id,omitempty" db:"clerk_org_id"`
	StripeCustomerID *string    `json:"stripe_customer_id,omitempty" db:"stripe_customer_id"`
	Plan             string     `json:"plan" db:"plan"`     // "free" | "pro" | "enterprise"
	Status           string     `json:"status" db:"status"` // "active" | "suspended"
	Balance          int64      `json:"balance" db:"balance"` // prepaid balance in cents
	TotalStorageBytes int64     `json:"total_storage_bytes" db:"total_storage_bytes"`
	TotalVideos      int        `json:"total_videos" db:"total_videos"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at" db:"updated_at"`
}
