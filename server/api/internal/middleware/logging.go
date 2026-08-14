package middleware

import (
	"math/rand"
	"net/http"
	"time"

	"github.com/motionmesh/server/shared/logger"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// SampledLogger returns a middleware that logs a percentage of requests.
// Errors (status >= 500) are always logged regardless of sample rate.
func SampledLogger(sampleRate float64, log *logger.Logger) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			t1 := time.Now()
			
			defer func() {
				status := ww.Status()
				
				// Always log server errors, otherwise sample
				if status >= 500 || rand.Float64() < sampleRate {
					log.Info("%s %s %d %s", r.Method, r.URL.Path, status, time.Since(t1))
				}
			}()

			next.ServeHTTP(ww, r)
		})
	}
}
