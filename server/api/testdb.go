package main
import (
	"context"
	"log"
	"os"
	"github.com/jackc/pgx/v5/pgxpool"
)
func main() {
	dbURL := os.Getenv("DATABASE_URL")
	log.Println("Connecting to:", dbURL)
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to create pool: %v", err)
	}
	defer pool.Close()
	log.Println("Pool created, pinging...")
	err = pool.Ping(ctx)
	if err != nil {
		log.Fatalf("Ping failed: %v", err)
	}
	log.Println("Ping successful!")
}
