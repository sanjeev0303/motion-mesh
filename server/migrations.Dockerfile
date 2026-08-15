FROM docker.io/migrate/migrate:v4.16.2 AS builder

FROM alpine:3.18

RUN adduser -D -H -u 1001 appuser

COPY --from=builder /usr/local/bin/migrate /usr/local/bin/migrate

WORKDIR /app
COPY infra/postgres/migrations /app/migrations

USER appuser

# We don't set CMD so we can override it easily in Kubernetes
