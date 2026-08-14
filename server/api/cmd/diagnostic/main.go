package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"

	"github.com/motionmesh/server/shared/config"
	"github.com/motionmesh/server/shared/logger"
)

func main() {
	cfg := config.Load()
	log := logger.New()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	log.Info("Starting diagnostic checks...")
	hasErrors := false

	// 1. Postgres Check
	log.Info("Checking Postgres connection")
	dbConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Error("Postgres config error: %v", err)
		hasErrors = true
	} else {
		db, err := pgxpool.NewWithConfig(ctx, dbConfig)
		if err != nil {
			log.Error("Postgres connection error: %v", err)
			hasErrors = true
		} else {
			defer db.Close()
			var n int
			err = db.QueryRow(ctx, "SELECT 1").Scan(&n)
			if err != nil {
				log.Error("Postgres SELECT 1 error: %v", err)
				hasErrors = true
			} else {
				log.Info("✅ Postgres check passed")
			}
		}
	}

	// 2. Redis Check
	log.Info("Checking Redis connection")
	rdbOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Error("Redis config error: %v", err)
		hasErrors = true
	} else {
		rdb := redis.NewClient(rdbOpts)
		defer rdb.Close()
		
		err = rdb.Ping(ctx).Err()
		if err != nil {
			log.Error("Redis ping error: %v", err)
			hasErrors = true
		} else {
			testKey := "diagnostic_test_key"
			err = rdb.Set(ctx, testKey, "1", time.Minute).Err()
			if err != nil {
				log.Error("Redis SET error: %v", err)
				hasErrors = true
			} else {
				_, err = rdb.Get(ctx, testKey).Result()
				if err != nil {
					log.Error("Redis GET error: %v", err)
					hasErrors = true
				} else {
					rdb.Del(ctx, testKey)
					log.Info("✅ Redis check passed")
				}
			}
		}
	}

	// 3. NATS Check
	log.Info("Checking NATS connection")
	nc, err := nats.Connect(cfg.QueueURL, nats.Timeout(5*time.Second))
	if err != nil {
		log.Error("NATS connect error: %v", err)
		hasErrors = true
	} else {
		defer nc.Drain()
		if !nc.IsConnected() {
			log.Error("NATS is not connected")
			hasErrors = true
		} else {
			log.Info("Running NATS Pub/Sub test")
			sub, err := nc.SubscribeSync("diagnostic.test")
			if err != nil {
				log.Error("NATS subscribe error: %v", err)
				hasErrors = true
			} else {
				err = nc.Publish("diagnostic.test", []byte("test_message"))
				if err != nil {
					log.Error("NATS publish error: %v", err)
					hasErrors = true
				} else {
					msg, err := sub.NextMsg(2 * time.Second)
					if err != nil {
						log.Error("NATS receive error: %v", err)
						hasErrors = true
					} else if string(msg.Data) != "test_message" {
						log.Error("NATS received wrong message: %s", string(msg.Data))
						hasErrors = true
					} else {
						log.Info("✅ NATS check passed (Pub/Sub verified)")
					}
				}
			}
		}
	}

	// 4. S3 Check
	log.Info("Checking S3 (Region: %s, Bucket: %s)", cfg.StorageRegion, cfg.StorageBucket)
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(cfg.StorageRegion))
	if err != nil {
		log.Error("AWS config error: %v", err)
		hasErrors = true
	} else {
		s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
			if cfg.StorageEndpoint != "" {
				o.BaseEndpoint = aws.String(cfg.StorageEndpoint)
			}
			o.UsePathStyle = cfg.StorageUsePathStyle
		})

		_, err = s3Client.HeadBucket(ctx, &s3.HeadBucketInput{
			Bucket: aws.String(cfg.StorageBucket),
		})
		if err != nil {
			log.Error("S3 HeadBucket error: %v", err)
			hasErrors = true
		} else {
			log.Info("✅ S3 check passed")
		}
	}

	if hasErrors {
		log.Error("❌ Diagnostics failed. See errors above.")
		os.Exit(1)
	}

	log.Info("✅ All diagnostics passed successfully!")
	fmt.Println("DIAGNOSTICS_SUCCESS")
}
