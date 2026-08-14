//go:build ignore

package main

import (
	"context"
	"fmt"
	"log"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func main() {
	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion("us-east-005"),
	)
	if err != nil {
		log.Fatal(err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String("https://s3.us-east-005.backblazeb2.com")
		o.UsePathStyle = true
	})

	buckets := []string{"dace7319-7f2d-48cf-8ec5-47181151f08a", "1c190bc5-f009-4e5c-a4ed-ddbc9c07b4b6"}
	for _, b := range buckets {
		_, err = client.CreateBucket(context.TODO(), &s3.CreateBucketInput{
			Bucket: aws.String(b),
		})
		if err != nil {
			fmt.Printf("Error creating %s: %v\n", b, err)
		} else {
			fmt.Printf("Successfully created %s\n", b)
		}
	}
}
