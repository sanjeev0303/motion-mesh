package models

import "time"

type APIKey struct {
	ID           string     `json:"id" db:"id"`
	AccountID    string     `json:"account_id" db:"account_id"`
	Name         string     `json:"name" db:"name"`
	Prefix       string     `json:"prefix" db:"prefix"`
	Hash         string     `json:"-" db:"hash"`
	Scopes       []string   `json:"scopes" db:"scopes"`
	LastUsedAt   *time.Time `json:"last_used_at" db:"last_used_at"`
	ExpiresAt    *time.Time `json:"expires_at" db:"expires_at"`
	RevokedAt    *time.Time `json:"revoked_at" db:"revoked_at"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
}
