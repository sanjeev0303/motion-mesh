FROM alpine:3.18

RUN apk add --no-cache curl tar && \
    adduser -D -H -u 1001 appuser

# Download golang-migrate
RUN curl -L https://github.com/golang-migrate/migrate/releases/download/v4.16.2/migrate.linux-amd64.tar.gz | tar xvz && \
    mv migrate /usr/local/bin/migrate

WORKDIR /app
COPY infra/postgres/migrations /app/migrations

USER appuser

# We don't set CMD so we can override it easily in Kubernetes
