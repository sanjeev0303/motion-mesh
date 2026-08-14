#!/bin/bash
set -e

echo "Running Migration Tests..."

# We assume a local testing DB URL is provided or use default
TEST_DB_URL=${TEST_DB_URL:-"postgres://postgres:postgres@localhost:5432/motionmesh_test?sslmode=disable"}

echo "1. Testing all migrations from scratch..."
go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest -path infra/postgres/migrations -database "$TEST_DB_URL" up

echo "2. Forcing down one step..."
go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest -path infra/postgres/migrations -database "$TEST_DB_URL" down 1

echo "3. Re-applying final migration..."
go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest -path infra/postgres/migrations -database "$TEST_DB_URL" up

echo "4. Testing idempotency by re-applying (should be a no-op)..."
go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest -path infra/postgres/migrations -database "$TEST_DB_URL" up

echo "Migrations tested successfully."
