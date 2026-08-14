package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/api/internal/auth"
	authpostgres "github.com/motionmesh/server/api/internal/auth/postgres"
	"github.com/motionmesh/server/shared/logger"
)

func main() {
    ctx := context.Background()
    db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    repo := authpostgres.NewRepository(db)
    svc := auth.NewService(repo, nil, "", "", logger.New())

    acc, err := repo.UpsertByClerkUserID(ctx, "test_user_456_different", "")
    if err != nil {
        log.Fatal("upsert:", err)
    }

    rawKey, _, err := svc.GenerateAPIKey(ctx, acc.ID, "Test Key 2")
    if err != nil {
        log.Fatal("generate:", err)
    }

    fmt.Printf("API_KEY_2=%s\n", rawKey)
}
