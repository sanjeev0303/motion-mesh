#!/bin/bash
if [ -f server/.env ]; then
    export $(grep -v '^#' server/.env | xargs)
fi

DB_CONN="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/motionmesh?sslmode=disable}"

echo "Running migrations via golang-migrate docker image..."
docker run --rm -v $(pwd)/infra/postgres/migrations:/migrations \
    --network host \
    migrate/migrate:v4.16.2 \
    -path=/migrations/ -database "$DB_CONN" up
