package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"
	lru "github.com/hashicorp/golang-lru/v2"
	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/metrics"
	"github.com/motionmesh/server/shared/models"
	"github.com/nats-io/nats.go"
	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/billing/meterevent"
	"golang.org/x/sync/singleflight"
)

type StripeOutboxEvent struct {
	ID               string
	AccountID        string
	StripeCustomerID string
	EventType        string
	Quantity         int64
	IdempotencyKey   string
	Attempts         int
	ClaimToken       string
}

type Repository interface {
	GetAccountByID(ctx context.Context, id string) (*models.Account, error)
	RecordUsageAndStripeEvent(ctx context.Context, event *models.UsageEvent, stripeCustomerID string) error
	ClaimStripeOutboxEvents(ctx context.Context, batchSize, maxAttempts int) ([]StripeOutboxEvent, error)
	MarkStripeEventsPublished(ctx context.Context, events []StripeOutboxEvent) error
	MarkStripeEventFailed(ctx context.Context, id, claimToken string, attempts, maxAttempts int, errStr string) error
}

type cachedAccount struct {
	acc       *models.Account
	expiresAt time.Time
}

type Consumer struct {
	repo            Repository
	stripeSecretKey string
	log             *logger.Logger
	
	// Account cache
	accCache *lru.Cache[string, cachedAccount]
	accSF    singleflight.Group
}

func NewConsumer(repo Repository, stripeSecretKey string, log *logger.Logger) *Consumer {
	stripe.Key = stripeSecretKey
	
	cache, _ := lru.New[string, cachedAccount](5000)
	
	c := &Consumer{
		repo:            repo,
		stripeSecretKey: stripeSecretKey,
		log:             log,
		accCache:        cache,
	}
	
	return c
}

func (c *Consumer) Stop() {
	// Any future cleanups
}

func (c *Consumer) getAccountCached(ctx context.Context, accountID string) (*models.Account, error) {
	if cached, ok := c.accCache.Get(accountID); ok {
		if time.Now().Before(cached.expiresAt) {
			return cached.acc, nil
		}
		c.accCache.Remove(accountID)
	}
	
	v, err, _ := c.accSF.Do(accountID, func() (interface{}, error) {
		if cached, ok := c.accCache.Get(accountID); ok && time.Now().Before(cached.expiresAt) {
			return cached.acc, nil
		}

		acc, err := c.repo.GetAccountByID(ctx, accountID)
		if err != nil {
			return nil, err
		}
		if acc == nil {
			return nil, nil
		}
		
		c.accCache.Add(accountID, cachedAccount{
			acc:       acc,
			expiresAt: time.Now().Add(5 * time.Minute),
		})
		
		return acc, nil
	})
	
	if err != nil {
		return nil, err
	}
	if v == nil {
		return nil, nil
	}
	return v.(*models.Account), nil
}

func (c *Consumer) StartStripeRelay(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	batchSize := 50
	maxAttempts := 5
	if val := os.Getenv("STRIPE_OUTBOX_MAX_ATTEMPTS"); val != "" {
		if v, err := strconv.Atoi(val); err == nil && v > 0 {
			maxAttempts = v
		}
	}

	for {
		select {
		case <-ctx.Done():
			c.log.Info("Stripe outbox relay shutting down")
			return
		case <-ticker.C:
			c.processStripeOutbox(ctx, batchSize, maxAttempts)
		}
	}
}

func (c *Consumer) processStripeOutbox(ctx context.Context, batchSize, maxAttempts int) {
	events, err := c.repo.ClaimStripeOutboxEvents(ctx, batchSize, maxAttempts)
	if err != nil {
		c.log.Error("Failed to claim stripe outbox events: %v", err)
		return
	}

	if len(events) == 0 {
		return
	}

	var publishedEvents []StripeOutboxEvent
	var wg sync.WaitGroup
	var mu sync.Mutex

	concurrency := 10
	if val := os.Getenv("STRIPE_CONCURRENCY"); val != "" {
		if v, err := strconv.Atoi(val); err == nil && v > 0 {
			concurrency = v
		}
	}
	sem := make(chan struct{}, concurrency)

	for _, ev := range events {
		wg.Add(1)
		sem <- struct{}{}
		go func(e StripeOutboxEvent) {
			defer wg.Done()
			defer func() { <-sem }()
			
			if os.Getenv("STRIPE_MODE") == "mock" {
				mu.Lock()
				publishedEvents = append(publishedEvents, e)
				mu.Unlock()
				return
			}

			params := &stripe.BillingMeterEventParams{
				EventName: stripe.String(e.EventType),
				Payload: map[string]string{
					"stripe_customer_id": e.StripeCustomerID,
					"value":              fmt.Sprintf("%d", e.Quantity),
				},
			}
			params.IdempotencyKey = stripe.String(e.IdempotencyKey)
			
			metrics.StripeAPICallsTotal.Inc()
			_, apiErr := meterevent.New(params)
			
			if apiErr != nil {
				c.log.Error("Stripe outbox failed to report meter event %s for %s (attempt %d): %v", e.EventType, e.AccountID, e.Attempts, apiErr)
				if dbErr := c.repo.MarkStripeEventFailed(ctx, e.ID, e.ClaimToken, e.Attempts, maxAttempts, apiErr.Error()); dbErr != nil {
					c.log.Error("Failed to mark stripe event failed: %v", dbErr)
				}
			} else {
				mu.Lock()
				publishedEvents = append(publishedEvents, e)
				mu.Unlock()
			}
		}(ev)
	}
	wg.Wait()

	if len(publishedEvents) > 0 {
		if err := c.repo.MarkStripeEventsPublished(ctx, publishedEvents); err != nil {
			c.log.Error("Failed to mark stripe outbox events as published: %v", err)
		}
	}
}

// ReportUsage writes to usage_events and stripe_outbox (source of truth).
func (c *Consumer) ReportUsage(ctx context.Context, eventID, accountID, eventType string, qty int64, stripeCustomerID string) error {
	event := &models.UsageEvent{
		ID:        eventID,
		EventID:   eventID,
		AccountID: accountID,
		EventType: eventType,
		Quantity:  qty,
		CreatedAt: time.Now(),
	}
	if err := c.repo.RecordUsageAndStripeEvent(ctx, event, stripeCustomerID); err != nil {
		return fmt.Errorf("billing: record usage and stripe outbox event: %w", err)
	}

	return nil
}

type usageEvent struct {
	EventID   string  `json:"event_id"`
	AccountID string  `json:"account_id"`
	VideoID   string  `json:"video_id"`
	Duration  float64 `json:"duration"`
}

func (c *Consumer) ConsumeUsageEvents(ctx context.Context, nc *nats.Conn) error {
	js, err := nc.JetStream()
	if err != nil {
		return fmt.Errorf("failed to get jetstream context: %w", err)
	}

	sub, err := js.PullSubscribe("motionmesh.billing.usage", "billing_usage_worker")
	if err != nil {
		return fmt.Errorf("failed to pull subscribe to usage events: %w", err)
	}

	c.log.Info("Started JetStream consuming usage events on motionmesh.billing.usage")

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			concurrency := 10
			if val := os.Getenv("BILLING_CONCURRENCY"); val != "" {
				if v, err := strconv.Atoi(val); err == nil && v > 0 {
					concurrency = v
				}
			}
			msgs, err := sub.Fetch(concurrency, nats.MaxWait(5*time.Second))
			if err != nil {
				if err != nats.ErrTimeout {
					c.log.Error("nats fetch error: %v", err)
				}
				continue
			}

			var wg sync.WaitGroup
			sem := make(chan struct{}, concurrency)

			for _, msg := range msgs {
				wg.Add(1)
				sem <- struct{}{}
				go func(m *nats.Msg) {
					defer wg.Done()
					defer func() { <-sem }()
					
					var ev usageEvent
					if err := json.Unmarshal(m.Data, &ev); err != nil {
						c.log.Error("unmarshal usage event: %v", err)
						m.Term()
						return
					}

				acc, err := c.getAccountCached(ctx, ev.AccountID)
				if err != nil || acc == nil {
					c.log.Error("failed to get account %s for usage reporting: %v", ev.AccountID, err)
					m.Nak()
					return
				}

				qty := int64(ev.Duration)
				if qty <= 0 {
					qty = 1 // Minimum 1 second billing
				}

				var stripeID string
				if acc.StripeCustomerID != nil {
					stripeID = *acc.StripeCustomerID
				}

				if ev.EventID == "" {
					c.log.Error("invalid message: missing event_id")
					m.Term()
					return
				}
				eventID := ev.EventID

					err = c.ReportUsage(ctx, eventID, ev.AccountID, "video_transcode_seconds", qty, stripeID)
					if err != nil {
						c.log.Error("failed to report usage for account %s: %v", ev.AccountID, err)
						m.Nak()
					} else {
						c.log.Info("Reported usage for account %s: %d seconds", ev.AccountID, qty)
						m.Ack()
					}
				}(msg)
			}
			wg.Wait()
		}
	}
}
