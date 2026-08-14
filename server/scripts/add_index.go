//go:build ignore

package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dsn := "postgresql://neondb_owner:npg_ga1wWr3VPUSZ@ep-sparkling-rice-azuyx8p2.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer pool.Close()

	_, err = pool.Exec(context.Background(), "CREATE INDEX IF NOT EXISTS analytics_daily_acc_day_idx ON analytics_daily (account_id, day DESC);")
	if err != nil {
		log.Printf("Error creating index 1: %v", err)
	}

	_, err = pool.Exec(context.Background(), "CREATE INDEX IF NOT EXISTS analytics_daily_acc_vid_day_idx ON analytics_daily (account_id, video_id, day DESC);")
	if err != nil {
		log.Printf("Error creating index 2: %v", err)
	}

	fmt.Println("Indexes created successfully.")
}
