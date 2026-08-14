package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	cryptorand "crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Account struct {
	ID               string
	Email            string
	ClerkUserID      string
	ClerkOrgID       string
	StripeCustomerID string
	Plan             string
	Status           string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type Bucket struct {
	ID        string
	AccountID string
	Name      string
	CreatedAt time.Time
}

type APIKey struct {
	ID        string
	AccountID string
	Name      string
	Prefix    string
	Hash      string
	Scopes    []string
	CreatedAt time.Time
}

type DataExport struct {
	AccountIDs []string `json:"account_ids"`
	APIKeys    []string `json:"api_keys"`
	BucketIDs  []string `json:"bucket_ids"`
	VideoIDs   []string `json:"video_ids"`
}

func main() {
	var (
		numAccounts int
		numVideos   int
		chunkSize   int
	)

	flag.IntVar(&numAccounts, "accounts", 100, "Number of test accounts to generate")
	flag.IntVar(&numVideos, "videos", 1000, "Total number of test videos to generate")
	flag.IntVar(&chunkSize, "chunk", 10000, "Chunk size for batched COPY inserts (memory bound)")
	flag.Parse()

	if os.Getenv("BENCHMARK_MODE") == "true" {
		if numAccounts < 100000 || numVideos < 100000 {
			log.Fatalf("BENCHMARK_MODE=true requires --accounts >= 100000 and --videos >= 100000. Found: accounts=%d, videos=%d", numAccounts, numVideos)
		}
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/motionmesh?sslmode=disable"
	}

	ctx := context.Background()

	poolConfig, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatalf("failed to parse db config: %v", err)
	}

	db, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		log.Fatalf("database connect: %v", err)
	}
	defer db.Close()

	if err := db.Ping(ctx); err != nil {
		log.Fatalf("database ping: %v", err)
	}

	log.Printf("Connected to database. Generating %d accounts and %d total videos using chunks of %d...", numAccounts, numVideos, chunkSize)

	startTime := time.Now()

	// 1. Generate Accounts, API Keys & Buckets in chunks to avoid OOM
	exportData := DataExport{
		AccountIDs: make([]string, 0, numAccounts),
		APIKeys:    make([]string, 0, numAccounts),
		BucketIDs:  make([]string, 0, numAccounts),
		VideoIDs:   make([]string, 0, numAccounts),
	}

	for i := 0; i < numAccounts; i += chunkSize {
		end := i + chunkSize
		if end > numAccounts {
			end = numAccounts
		}

		batchSize := end - i
		accountRows := make([][]any, batchSize)
		bucketRows := make([][]any, batchSize)
		apiKeyRows := make([][]any, batchSize)
		videoRows := make([][]any, batchSize)
		now := time.Now()

		for j := 0; j < batchSize; j++ {
			accID := uuid.New().String()
			bucketID := uuid.New().String()
			vidID := uuid.New().String()

			// Generate API Key
			prefixBytes := make([]byte, 8)
			secretBytes := make([]byte, 32)
			cryptorand.Read(prefixBytes)
			cryptorand.Read(secretBytes)

			prefix := "mot_test_" + hex.EncodeToString(prefixBytes)
			secret := hex.EncodeToString(secretBytes)
			rawKey := prefix + "." + secret

			hashBytes := sha256.Sum256([]byte(secret))
			hash := hex.EncodeToString(hashBytes[:])

			exportData.AccountIDs = append(exportData.AccountIDs, accID)
			exportData.BucketIDs = append(exportData.BucketIDs, bucketID)
			exportData.APIKeys = append(exportData.APIKeys, rawKey)
			exportData.VideoIDs = append(exportData.VideoIDs, vidID)

			accountRows[j] = []any{
				accID,
				fmt.Sprintf("loadtest-user-%d-%s@example.com", i+j, accID[:8]),
				"user_" + accID,
				"org_" + accID,
				"cus_" + accID[:14],
				"free",
				"active",
				now,
				now,
			}

			bucketRows[j] = []any{
				bucketID,
				accID,
				fmt.Sprintf("loadtest-bucket-%s", accID[:8]),
				now,
			}

			apiKeyRows[j] = []any{
				uuid.New().String(),
				accID,
				"Loadtest Key",
				prefix,
				hash,
				[]string{"*"},
				now,
			}

			videoRows[j] = []any{
				vidID,
				accID,
				bucketID,
				fmt.Sprintf("raw/%s.mp4", vidID),
				fmt.Sprintf("Primary Load Test Video %d", i+j),
				"ready",
				float32(rand.Intn(3600)),            // up to 1 hour
				int64(rand.Intn(1024 * 1024 * 500)), // up to 500MB
				now,
				now,
			}
		}

		_, err = db.CopyFrom(
			ctx,
			pgx.Identifier{"accounts"},
			[]string{"id", "email", "clerk_user_id", "clerk_org_id", "stripe_customer_id", "plan", "status", "created_at", "updated_at"},
			pgx.CopyFromRows(accountRows),
		)
		if err != nil {
			log.Fatalf("failed to insert accounts chunk: %v", err)
		}

		_, err = db.CopyFrom(
			ctx,
			pgx.Identifier{"buckets"},
			[]string{"id", "account_id", "name", "created_at"},
			pgx.CopyFromRows(bucketRows),
		)
		if err != nil {
			log.Fatalf("failed to insert buckets chunk: %v", err)
		}

		_, err = db.CopyFrom(
			ctx,
			pgx.Identifier{"api_keys"},
			[]string{"id", "account_id", "name", "prefix", "hash", "scopes", "created_at"},
			pgx.CopyFromRows(apiKeyRows),
		)
		if err != nil {
			log.Fatalf("failed to insert api_keys chunk: %v", err)
		}

		_, err = db.CopyFrom(
			ctx,
			pgx.Identifier{"videos"},
			[]string{"id", "account_id", "bucket_id", "object_key", "title", "status", "duration", "size_bytes", "created_at", "updated_at"},
			pgx.CopyFromRows(videoRows),
		)
		if err != nil {
			log.Fatalf("failed to insert base videos chunk: %v", err)
		}

		log.Printf("Inserted accounts %d to %d...", i, end)
	}

	log.Printf("Successfully inserted %d accounts and buckets.", numAccounts)

	// 2. Generate extra Videos in chunks
	extraVideos := numVideos - numAccounts
	if extraVideos > 0 && numAccounts > 0 {
		for i := 0; i < extraVideos; i += chunkSize {
			end := i + chunkSize
			if end > extraVideos {
				end = extraVideos
			}

			batchSize := end - i
			videoRows := make([][]any, batchSize)
			now := time.Now()

			for j := 0; j < batchSize; j++ {
				// Pareto distribution for realistic hot-keys (80% of videos to 20% of accounts)
				var idx int
				if rand.Float32() < 0.8 {
					idx = rand.Intn(numAccounts / 5) // Hot accounts
				} else {
					idx = rand.Intn(numAccounts) // Any account
				}
				if idx >= numAccounts {
					idx = numAccounts - 1
				}

				accID := exportData.AccountIDs[idx]
				bktID := exportData.BucketIDs[idx]
				vidID := uuid.New().String()

				exportData.VideoIDs = append(exportData.VideoIDs, vidID)

				videoRows[j] = []any{
					vidID,
					accID,
					bktID,
					fmt.Sprintf("raw/%s.mp4", vidID),
					fmt.Sprintf("Load Test Video %d", i+j),
					"queued",
					float32(rand.Intn(3600)),            // up to 1 hour
					int64(rand.Intn(1024 * 1024 * 500)), // up to 500MB
					now,
					now,
				}
			}

			_, err = db.CopyFrom(
				ctx,
				pgx.Identifier{"videos"},
				[]string{"id", "account_id", "bucket_id", "object_key", "title", "status", "duration", "size_bytes", "created_at", "updated_at"},
				pgx.CopyFromRows(videoRows),
			)
			if err != nil {
				log.Fatalf("failed to insert extra videos chunk %d-%d: %v", i, end, err)
			}

			log.Printf("Inserted extra videos %d to %d...", i, end)
		}
		log.Printf("Successfully inserted %d extra videos.", extraVideos)
	}

	// 3. Write data.json
	file, err := os.Create("tests/load/k6/data.json")
	if err != nil {
		log.Fatalf("failed to create data.json: %v", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(exportData); err != nil {
		log.Fatalf("failed to encode data.json: %v", err)
	}

	duration := time.Since(startTime)
	log.Printf("Load data generation complete in %s.", duration)
}
