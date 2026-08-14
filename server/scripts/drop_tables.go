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

	_, err = pool.Exec(context.Background(), "DROP TABLE IF EXISTS playlist_videos; DROP TABLE IF EXISTS playlists;")
	if err != nil {
		log.Fatalf("Error dropping tables: %v", err)
	}

	fmt.Println("Tables dropped successfully.")
}
