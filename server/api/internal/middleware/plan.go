package middleware

import (
	"context"
	"net/http"

	"github.com/motionmesh/server/api/internal/auth"
	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/models"
)

type PlanChecker interface {
	GetAccountPlan(ctx context.Context, accountID string) (string, error)
}

// RequirePlan returns HTTP middleware that enforces a minimum plan tier.
// The account must be in the request context (set by auth.Middleware).
// It fetches the latest plan status from the cache/DB via PlanChecker.
// On failure: returns 403 with a machine-readable upgrade prompt.
func RequirePlan(tier string, checker PlanChecker) func(http.Handler) http.Handler {
	planRank := map[string]int{
		"free":       0,
		"pro":        1,
		"enterprise": 2,
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
			if !ok || acc == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			
			// Fetch fresh plan from cache or DB instead of trusting the potentially stale JWT claim/context
			currentPlan, err := checker.GetAccountPlan(r.Context(), acc.ID)
			if err != nil {
				currentPlan = acc.Plan // fallback to context
			}

			accountRank := planRank[currentPlan]
			requiredRank := planRank[tier]

			if accountRank < requiredRank {
				logger.New().Error("RequirePlan forbidden: account_id=%s current_plan=%s account_rank=%d required_plan=%s required_rank=%d", acc.ID, currentPlan, accountRank, tier, requiredRank)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				w.Write([]byte(`{"error":"plan_upgrade_required","required_plan":"` + tier + `","current_plan":"` + currentPlan + `"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
