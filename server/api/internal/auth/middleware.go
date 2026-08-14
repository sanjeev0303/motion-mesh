package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/models"
)

type contextKey string

const AccountContextKey contextKey = "account"

// Middleware returns an HTTP middleware that authenticates requests via:
//   1. Clerk session JWT (Authorization: Bearer <clerk_token>) — for dashboard
//   2. mot_live_/mot_test_ API key (Authorization: Bearer mot_live_...) — for SDK callers
//
// Both paths resolve to an account_id stored in the request context.
// Requests to exemptPaths are passed through without authentication.
func Middleware(svc *Service, loadTestMode bool, exemptPaths ...string) func(http.Handler) http.Handler {
	exempt := make(map[string]struct{}, len(exemptPaths))
	for _, p := range exemptPaths {
		exempt[p] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Check exemption list first.
			if _, ok := exempt[r.URL.Path]; ok {
				next.ServeHTTP(w, r)
				return
			}

			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				logger.New().Error("unauthorized: missing or invalid Authorization header, got: %s", header)
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			token := strings.TrimPrefix(header, "Bearer ")

			var (
				account  interface{}
				err      error
				authType string
			)

			// Route to the correct verification path by key prefix.
			if loadTestMode && token == "test_benchmark_token" {
				authType = "Benchmark Bypass"
				account = &models.Account{
					ID:    "00000000-0000-0000-0000-000000000000",
					Email: "benchmark@motionmesh.test",
					Plan:  "pro",
				}
				err = nil
			} else if strings.HasPrefix(token, "mot_live_") || strings.HasPrefix(token, "mot_test_") {
				authType = "API Key"
				account, err = svc.VerifyAPIKey(r.Context(), token)
			} else {
				authType = "Clerk JWT"
				account, err = svc.VerifyClerkToken(r.Context(), token)
			}

			if err != nil {
				safeToken := token
				if len(token) > 16 {
					safeToken = token[:16] + "..."
				}
				logger.New().Error("unauthorized: %s verification failed: %v (token prefix: %s)", authType, err, safeToken)
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), AccountContextKey, account)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
