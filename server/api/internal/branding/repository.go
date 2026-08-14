package branding

import (
	"context"
)

// ObjectStorage is a narrow interface for what branding actually needs.
// Defined here — not imported from the storage package, per Interface Segregation.
type ObjectStorage interface {
	PutObject(ctx context.Context, key string, data []byte, contentType string) error
	GetPresignedURL(ctx context.Context, key string) (string, error)
}
