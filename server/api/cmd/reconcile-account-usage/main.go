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

	log.Println("Starting account usage reconciliation in batches...")

	batchSize := 100
	var lastID string
	var totalReconciled int

	for {
		query := `
			SELECT id FROM accounts
			WHERE id > $1
			ORDER BY id ASC
			LIMIT $2
		`
		rows, err := pool.Query(ctx, query, lastID, batchSize)
		if err != nil {
			log.Fatalf("Failed to query accounts: %v", err)
		}

		var ids []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				log.Fatalf("Failed to scan account id: %v", err)
			}
			ids = append(ids, id)
		}
		rows.Close()

		if len(ids) == 0 {
			break
		}

		// Update counters for this batch.
		// Exclude soft-deleted videos to keep counters accurate.
		updateQuery := `
			UPDATE accounts a
			SET total_videos       = COALESCE((SELECT COUNT(*) FROM videos v WHERE v.account_id = a.id AND v.deleted_at IS NULL), 0),
			    total_storage_bytes = COALESCE((SELECT SUM(size_bytes) FROM videos v WHERE v.account_id = a.id AND v.deleted_at IS NULL), 0)
			WHERE a.id = ANY($1::text[])
		`
		tag, err := pool.Exec(ctx, updateQuery, ids)
		if err != nil {
			log.Fatalf("Failed to update accounts: %v", err)
		}

		totalReconciled += int(tag.RowsAffected())
		lastID = ids[len(ids)-1]
		log.Printf("Reconciled %d accounts (Total: %d)", tag.RowsAffected(), totalReconciled)
	}

	log.Printf("Successfully reconciled %d accounts", totalReconciled)
}
