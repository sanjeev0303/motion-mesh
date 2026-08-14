package billing

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/motionmesh/server/api/internal/auth"
	"github.com/motionmesh/server/shared/models"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	// Webhooks
	r.Post("/webhook", h.handleWebhook)

	// Protected routes (require auth middleware upstream)
	r.Get("/invoices", h.listInvoices)
	r.Get("/subscription", h.getSubscription)
	r.Get("/usage", h.getUsage)
	r.Post("/portal", h.createPortalSession)
	r.Post("/checkout", h.createCheckoutSession)
	r.Post("/funds", h.addFunds)
}

func (h *Handler) handleWebhook(w http.ResponseWriter, r *http.Request) {
	// Stripe webhook signature is required
	sigHeader := r.Header.Get("Stripe-Signature")
	
	payload, err := ParseBody(r)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	if err := h.service.HandleWebhook(r.Context(), payload, sigHeader); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) listInvoices(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if account.StripeCustomerID == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]interface{}{})
		return
	}

	invoices, err := h.service.ListInvoices(r.Context(), *account.StripeCustomerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invoices)
}

func (h *Handler) getSubscription(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// We return the plan and status from the request context (populated by auth middleware).
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"plan":    account.Plan,
		"status":  account.Status,
		"balance": account.Balance,
	})
}

func (h *Handler) getUsage(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	storageUsage, _ := h.service.GetAggregatedUsage(r.Context(), account.ID, "storage_gb")
	bandwidthUsage, _ := h.service.GetAggregatedUsage(r.Context(), account.ID, "bandwidth_gb")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"storage_gb":   storageUsage,
		"bandwidth_gb": bandwidthUsage,
	})
}

func (h *Handler) createPortalSession(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ReturnURL string `json:"return_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	url, err := h.service.CreatePortalSession(r.Context(), account, req.ReturnURL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"url": url,
	})
}

func (h *Handler) createCheckoutSession(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		PriceID   string `json:"price_id"`
		ReturnURL string `json:"return_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	url, err := h.service.CreateCheckoutSession(r.Context(), account, req.PriceID, req.ReturnURL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"url": url,
	})
}

func (h *Handler) addFunds(w http.ResponseWriter, r *http.Request) {
	account, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || account == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Amount int64 `json:"amount"` // in cents
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	newBalance, err := h.service.AddFunds(r.Context(), account.ID, req.Amount)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"balance": newBalance,
	})
}
