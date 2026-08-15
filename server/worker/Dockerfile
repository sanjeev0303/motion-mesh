FROM golang:1.25-alpine AS deps

WORKDIR /src

COPY go.work go.work
COPY go.work.sum go.work.sum
COPY api/go.mod api/go.mod
COPY worker/go.mod worker/go.mod
COPY shared/go.mod shared/go.mod

# Cache /go/pkg/mod so module downloads persist across builds
RUN --mount=type=cache,target=/go/pkg/mod \
    go work edit -dropuse=./scripts -dropuse=./cmd/generate-load-data && \
    go work sync && \
    cd api && go mod download && \
    cd ../worker && go mod download && \
    cd ../shared && go mod download

# ─── Stage 2: build ──────────────────────────────────────────────────────────
FROM deps AS builder

COPY shared/ shared/
COPY worker/ worker/
COPY api/ api/

# Cache both module cache and the Go build cache (compiled pkgs)
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd worker && \
    CGO_ENABLED=0 GOOS=linux GOMEMLIMIT=512MiB GOGC=50 \
    go build \
      -p 2 \
      -trimpath \
      -ldflags="-s -w" \
      -o /bin/worker \
      ./cmd/worker/main.go && \
    cd ../api && \
    CGO_ENABLED=0 GOOS=linux GOMEMLIMIT=512MiB GOGC=50 \
    go build \
      -p 2 \
      -trimpath \
      -ldflags="-s -w" \
      -o /app/diagnostic \
      ./cmd/diagnostic/main.go

# ─── Stage 3: runtime with FFmpeg ────────────────────────────────────────────
FROM alpine:3.20 AS runner

RUN --mount=type=cache,target=/var/cache/apk \
    apk add ffmpeg ca-certificates && \
    adduser -D -H -u 1001 appuser

COPY --from=builder /bin/worker /bin/worker
COPY --from=builder /app/diagnostic /app/diagnostic

USER appuser

ENTRYPOINT ["/bin/worker"]
