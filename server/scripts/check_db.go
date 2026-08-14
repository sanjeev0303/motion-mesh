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

	var uCount, aCount, cCount int
	err = pool.QueryRow(context.Background(), "SELECT count(*) FROM usage_events;").Scan(&uCount)
	if err != nil {
		log.Printf("Error counting usage_events: %v", err)
	}

	err = pool.QueryRow(context.Background(), "SELECT count(*) FROM analytics_daily;").Scan(&aCount)
	if err != nil {
		log.Printf("Error counting analytics_daily: %v", err)
	}

	err = pool.QueryRow(context.Background(), "SELECT count(*) FROM chapters;").Scan(&cCount)
	if err != nil {
		log.Printf("Error counting chapters: %v", err)
	}

	fmt.Printf("Counts:\n usage_events: %d\n analytics_daily: %d\n chapters: %d\n", uCount, aCount, cCount)
}
