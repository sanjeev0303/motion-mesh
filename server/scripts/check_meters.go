//go:build ignore

package main

import (
	"fmt"
	"log"
	"os"

	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/billing/meter"
)

func main() {
	stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
	if stripe.Key == "" {
		log.Fatal("STRIPE_SECRET_KEY not set")
	}

	params := &stripe.BillingMeterListParams{}
	iter := meter.List(params)
	fmt.Println("Meters:")
	for iter.Next() {
		m := iter.BillingMeter()
		fmt.Printf("- ID: %s, DisplayName: %s, EventName: %s, Status: %s\n", m.ID, m.DisplayName, m.EventName, m.Status)
	}

	if err := iter.Err(); err != nil {
		log.Fatalf("Error listing meters: %v", err)
	}
}
