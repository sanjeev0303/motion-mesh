package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/motionmesh/server/api/internal/auth"
	authpostgres "github.com/motionmesh/server/api/internal/auth/postgres"
	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/models"
	"github.com/redis/go-redis/v9"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	defer rdb.Close()

	authRepo := authpostgres.NewRepository(db)
	authSvc := auth.NewService(authRepo, rdb, "dummy", "dummy", logger.New())

	// Insert dummy account
	var acc models.Account
	err = db.QueryRow(ctx, "INSERT INTO accounts (id, email, clerk_user_id, plan, status) VALUES (gen_random_uuid(), 'test@example.com', 'test_user', 'pro', 'active') RETURNING id").Scan(&acc.ID)
	if err != nil {
		fmt.Printf("Error inserting account: %v\n", err)
	} else {
		fmt.Printf("Inserted account: %s\n", acc.ID)
	}
	
	rawKey, key, err := authSvc.GenerateAPIKey(ctx, acc.ID, "Test Key")
	if err != nil {
		panic(err)
	}

	fmt.Printf("Generated API Key: %s\n", rawKey)
	fmt.Printf("Prefix: %s\n", key.Prefix)
}
