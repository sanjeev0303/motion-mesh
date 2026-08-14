package auth

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/motionmesh/server/shared/models"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Post("/", h.createAPIKey)
	r.Get("/", h.listAPIKeys)
	r.Delete("/{id}", h.revokeAPIKey)
}

type CreateAPIKeyRequest struct {
	Name string `json:"name"`
}

type CreateAPIKeyResponse struct {
	Key    string         `json:"key"` // The actual secret key (only returned once)
	APIKey *models.APIKey `json:"api_key"`
}

func (h *Handler) createAPIKey(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	rawKey, key, err := h.service.GenerateAPIKey(r.Context(), account.ID, req.Name)
	if err != nil {
		http.Error(w, "Failed to generate API key", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(CreateAPIKeyResponse{
		Key:    rawKey,
		APIKey: key,
	})
}

func (h *Handler) listAPIKeys(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	keys, err := h.service.ListAPIKeys(r.Context(), account.ID)
	if err != nil {
		http.Error(w, "Failed to list API keys", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

func (h *Handler) revokeAPIKey(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	keyID := chi.URLParam(r, "id")
	if keyID == "" {
		http.Error(w, "API Key ID is required", http.StatusBadRequest)
		return
	}

	if err := h.service.RevokeAPIKey(r.Context(), account.ID, keyID); err != nil {
		http.Error(w, "Failed to revoke API key", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
