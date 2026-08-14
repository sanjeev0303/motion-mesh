package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chmw "github.com/go-chi/chi/v5/middleware"
	"github.com/motionmesh/server/shared/metrics"
)

// ─── PhaseTracker ─────────────────────────────────────────────────────────────

// contextKey is an unexported type for context keys in this package.
type contextKey int

const trackerKey contextKey = iota

// PhaseTracker records per-phase latency for a single HTTP request.
// Retrieve it from context with TrackerFromContext(ctx).
//
// Phase labels (use these consistently):
//
//	auth          — token / API-key verification
//	local_cache   — in-process LRU lookup
//	redis         — Redis round trip
//	postgres      — PostgreSQL query
//	serialization — JSON marshal / unmarshal
//	nats          — NATS publish / subscribe
//	s3            — Object-storage operation
//	business      — Application logic
//	other         — Anything else
type PhaseTracker struct {
	route string
}

// Phase starts timing a named phase. Call the returned function to stop the
// timer and emit the observation. Safe to call on a nil tracker (no-op).
//
//	defer tracker.Phase("postgres")()
func (pt *PhaseTracker) Phase(phase string) func() {
	if pt == nil {
		return func() {}
	}
	start := time.Now()
	route := pt.route
	return func() {
		metrics.RequestPhaseLatency.WithLabelValues(route, phase).Observe(time.Since(start).Seconds())
	}
}

// TrackerFromContext retrieves the PhaseTracker for the current request.
// Returns nil when no tracker is in context; all PhaseTracker methods handle nil.
func TrackerFromContext(ctx context.Context) *PhaseTracker {
	t, _ := ctx.Value(trackerKey).(*PhaseTracker)
	return t
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// SpanTimingMiddleware injects a PhaseTracker into each request's context and
// emits a "total" phase observation once the handler returns.
// Register it AFTER chi's routing middleware so the route pattern is resolved.
func SpanTimingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tracker := &PhaseTracker{}
		r = r.WithContext(context.WithValue(r.Context(), trackerKey, tracker))

		ww := chmw.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()

		next.ServeHTTP(ww, r)

		// Resolve route pattern after routing is complete.
		route := "unmatched"
		if rc := chi.RouteContext(r.Context()); rc != nil && rc.RoutePattern() != "" {
			route = r.Method + " " + rc.RoutePattern()
		}
		// Write back so any Phase calls made by handlers use the correct route label.
		tracker.route = route

		// Emit the total request duration.
		metrics.RequestPhaseLatency.WithLabelValues(route, "total").Observe(time.Since(start).Seconds())
	})
}
