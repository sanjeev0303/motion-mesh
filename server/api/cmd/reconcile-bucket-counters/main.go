package main

import (
	"context"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	log.Println("Connecting to database...")
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to db: %v", err)
	}
	defer pool.Close()

	log.Println("Starting bucket counter reconciliation in batches...")

	batchSize := 100
	var lastID string
	var totalReconciled int

	for {
		query := `
			SELECT id FROM buckets
			WHERE id > $1
			ORDER BY id ASC
			LIMIT $2
		`
		rows, err := pool.Query(ctx, query, lastID, batchSize)
		if err != nil {
			log.Fatalf("Failed to query buckets: %v", err)
		}

		var ids []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				log.Fatalf("Failed to scan bucket id: %v", err)
			}
			ids = append(ids, id)
		}
		rows.Close()

		if len(ids) == 0 {
			break
		}

		// Update counters for this batch.
		// Column names must match migration 011: total_objects and total_bytes.
		updateQuery := `
			UPDATE buckets b
			SET total_objects = COALESCE((SELECT COUNT(*) FROM objects o WHERE o.bucket_id = b.id), 0),
			    total_bytes   = COALESCE((SELECT SUM(size_bytes) FROM objects o WHERE o.bucket_id = b.id), 0)
			WHERE b.id = ANY($1::text[])
		`
		tag, err := pool.Exec(ctx, updateQuery, ids)
		if err != nil {
			log.Fatalf("Failed to update buckets: %v", err)
		}

		totalReconciled += int(tag.RowsAffected())
		lastID = ids[len(ids)-1]
		log.Printf("Reconciled %d buckets (Total: %d)", tag.RowsAffected(), totalReconciled)
	}

	log.Printf("Successfully reconciled %d buckets", totalReconciled)
}
