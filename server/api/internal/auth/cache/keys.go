package cache

import "fmt"

// Version is the cache namespace version. Bump it whenever the structure of
// what is cached changes (fields added/removed, digest algorithm changed, etc.).
// Incrementing this effectively invalidates all existing entries without
// needing an explicit cache flush — old keys become unreachable, not deleted.
const Version = "v1"

// APIKeyKey returns the Redis/LRU key for an API key cache entry.
// keyID is the key prefix (e.g. "mot_live_abc123").
func APIKeyKey(keyID string) string {
	return fmt.Sprintf("mot:api_key:%s:%s", Version, keyID)
}
