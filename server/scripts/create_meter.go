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

	params := &stripe.BillingMeterParams{
		DisplayName: stripe.String("Video Transcoding (Seconds)"),
		EventName:   stripe.String("video_transcode_seconds"),
		DefaultAggregation: &stripe.BillingMeterDefaultAggregationParams{
			Formula: stripe.String(string(stripe.BillingMeterDefaultAggregationFormulaSum)),
		},
		ValueSettings: &stripe.BillingMeterValueSettingsParams{
			EventPayloadKey: stripe.String("value"),
		},
	}

	m, err := meter.New(params)
	if err != nil {
		log.Fatalf("Error creating meter: %v", err)
	}
	fmt.Printf("Created meter: ID=%s, DisplayName=%s, EventName=%s\n", m.ID, m.DisplayName, m.EventName)
}
