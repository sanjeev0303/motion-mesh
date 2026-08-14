package branding

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/api/internal/auth"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/", h.getWatermark)
	r.Put("/", h.updateWatermark)
	r.Post("/asset", h.uploadAsset)
}

func (h *Handler) getWatermark(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	wm, err := h.service.GetWatermark(r.Context(), account.ID)
	if err != nil {
		// Branding repository currently returns an error if not found, or maybe just nil.
		// If it's a "not found", we shouldn't fail with 500.
		// Assuming we just return empty or 404 for now, let's just use 404 if it's not found
		// For simplicity, we'll return 404 if it's nil
		if wm == nil {
			http.Error(w, "Watermark not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to get watermark", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(wm)
}

type UpdateWatermarkRequest struct {
	Position string  `json:"position"`
	Opacity  float32 `json:"opacity"`
}

func (h *Handler) updateWatermark(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req UpdateWatermarkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if req.Position == "" {
		req.Position = "bottom-right"
	}
	if req.Opacity == 0 {
		req.Opacity = 0.8
	}

	wm, err := h.service.UpdateWatermark(r.Context(), account.ID, req.Position, req.Opacity)
	if err != nil {
		http.Error(w, "Failed to update watermark", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(wm)
}

func (h *Handler) uploadAsset(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Limit upload size to 5MB
	r.ParseMultipartForm(5 << 20)

	file, handler, err := r.FormFile("asset")
	if err != nil {
		http.Error(w, "Invalid file upload", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	contentType := handler.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	wm, err := h.service.UploadAsset(r.Context(), account.ID, data, contentType)
	if err != nil {
		http.Error(w, "Failed to upload asset", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(wm)
}
