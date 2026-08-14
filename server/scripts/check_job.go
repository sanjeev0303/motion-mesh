//go:build ignore

package main

import (
	"context"
	"fmt"
	"os"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dbURL)
	if err != nil { panic(err) }
	defer db.Close()

	var id, status, errMsg string
	err = db.QueryRow(ctx, "SELECT id, status, COALESCE(error_msg, '') FROM transcode_jobs WHERE video_id = $1", "8addc273-b57f-4174-b6a2-35cdf764a525").Scan(&id, &status, &errMsg)
	if err != nil { panic(err) }
	
	fmt.Printf("Job %s: status=%s, err=%s\n", id, status, errMsg)
}
