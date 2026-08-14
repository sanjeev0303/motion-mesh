package buckets

import (
	"encoding/json"
	"net/http"

	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/motionmesh/server/api/internal/auth"
	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/shared/pagination"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/", h.listBuckets)
	r.Post("/", h.createBucket)
	r.Get("/{id}/objects", h.listObjects)
}

func (h *Handler) listBuckets(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	bucketsList, err := h.service.ListBuckets(r.Context(), account.ID)
	if err != nil {
		http.Error(w, "Failed to list buckets", http.StatusInternalServerError)
		return
	}

	// Make sure we don't return nil for empty slices for JSON consistency
	if bucketsList == nil {
		bucketsList = make([]*models.Bucket, 0)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bucketsList)
}

func (h *Handler) createBucket(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var bucket models.Bucket
	if err := json.NewDecoder(r.Body).Decode(&bucket); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	bucket.AccountID = account.ID

	if err := h.service.CreateBucket(r.Context(), &bucket); err != nil {
		http.Error(w, "Failed to create bucket", http.StatusInternalServerError)
		return
	}

	// Mocking defaults for UI
	bucket.Region = "us-east-1"
	bucket.StorageLimitBytes = 1024 * 1024 * 1024 * 1024
	bucket.EgressLimitBytes = 5 * 1024 * 1024 * 1024 * 1024

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(bucket)
}

func (h *Handler) listObjects(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	bucketID := chi.URLParam(r, "id")
	if bucketID == "" {
		http.Error(w, "Bucket ID is required", http.StatusBadRequest)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 100 // default
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	cursor := r.URL.Query().Get("cursor")

	objects, err := h.service.ListObjectsByBucket(r.Context(), account.ID, bucketID, limit, cursor)
	if err != nil {
		if err == pagination.ErrInvalidCursor {
			http.Error(w, "Invalid cursor format", http.StatusBadRequest)
			return
		}
		logger.New().Error("ListObjectsByBucket failed: %v", err)
		http.Error(w, "Failed to list objects", http.StatusInternalServerError)
		return
	}

	if objects == nil {
		objects = make([]*models.BucketObject, 0)
	}

	var nextCursor string
	if len(objects) == limit && len(objects) > 0 {
		lastObj := objects[len(objects)-1]
		c := pagination.ObjectCursor{
			UploadedAt: lastObj.UploadedAt,
			ID:         lastObj.ID,
		}
		if encoded, err := pagination.EncodeCursor(c); err == nil {
			nextCursor = encoded
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"objects":     objects,
		"next_cursor": nextCursor,
	})
}
