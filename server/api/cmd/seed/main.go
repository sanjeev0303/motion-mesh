package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/api/internal/auth"
	authpostgres "github.com/motionmesh/server/api/internal/auth/postgres"
	"github.com/motionmesh/server/shared/logger"
)

func main() {
    ctx := context.Background()
    db, err := pgxpool.New(ctx, "postgresql://neondb_owner:npg_ga1wWr3VPUSZ@ep-sparkling-rice-azuyx8p2-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    repo := authpostgres.NewRepository(db)
    svc := auth.NewService(repo, nil, "", "", logger.New())

    acc, err := repo.UpsertByClerkUserID(ctx, "test_user_123", "")
    if err != nil {
        log.Fatal("upsert:", err)
    }

    rawKey, _, err := svc.GenerateAPIKey(ctx, acc.ID, "Test Key")
    if err != nil {
        log.Fatal("generate:", err)
    }

    fmt.Printf("API_KEY=%s\n", rawKey)
    fmt.Printf("ACCOUNT_ID=%s\n", acc.ID)
}
