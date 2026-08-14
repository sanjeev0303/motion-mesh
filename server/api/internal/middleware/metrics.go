package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/motionmesh/server/shared/metrics"
)

// MetricsMiddleware records HTTP request duration and status codes.
func MetricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		duration := time.Since(start).Seconds()
		status := ww.Status()

		if status == 0 {
			status = 200
		}

		routeContext := chi.RouteContext(r.Context())
		path := "unmatched"
		if routeContext != nil && routeContext.RoutePattern() != "" {
			path = routeContext.RoutePattern()
		}

		statusStr := strconv.Itoa(status)
		metrics.APIRequestsTotal.WithLabelValues(r.Method, path, statusStr).Inc()
		metrics.APIRequestDuration.WithLabelValues(r.Method, path).Observe(duration)
	})
}
