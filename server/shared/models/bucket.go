package models

import "time"

type Bucket struct {
	ID                string    `json:"id"`
	AccountID         string    `json:"-"`
	Name              string    `json:"name"`
	Region            string    `json:"region"`
	StorageUsedBytes  int64     `json:"storageUsedBytes"`
	StorageLimitBytes int64     `json:"storageLimitBytes"`
	EgressUsedBytes   int64     `json:"egressUsedBytes"`
	EgressLimitBytes  int64     `json:"egressLimitBytes"`
	ObjectCount       int       `json:"objectCount"`
	CreatedAt         time.Time `json:"createdAt"`
}
