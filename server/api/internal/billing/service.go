package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/metrics"
	"github.com/motionmesh/server/shared/models"
	"github.com/redis/go-redis/v9"
	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/billing/meter"
	"github.com/stripe/stripe-go/v82/billing/meterevent"
	"github.com/stripe/stripe-go/v82/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/customer"
	"github.com/stripe/stripe-go/v82/invoice"
	"github.com/stripe/stripe-go/v82/webhook"
)

// Service handles Stripe Meters API reporting and webhook processing.
// It is the only layer that imports Stripe SDK types.
type Service struct {
	repo           BillingRepository
	rdb            *redis.Client
	webhookSecret  string
	meterEventName string // Stripe Meter name (e.g. "api_requests")
	sfGroup        singleflight.Group
	log            *logger.Logger
}

func NewService(repo BillingRepository, rdb *redis.Client, stripeSecretKey, webhookSecret string, log *logger.Logger) *Service {
	stripe.Key = stripeSecretKey
	return &Service{
		repo:          repo,
		rdb:           rdb,
		webhookSecret: webhookSecret,
		log:           log,
	}
}

// ReportUsage writes to usage_events (source of truth) and sends a Stripe Meter Event.
// Stripe Meter Events are downstream projections — the DB record is authoritative.
func (s *Service) ReportUsage(ctx context.Context, eventID, accountID, eventType string, qty int64, stripeCustomerID string) error {
	event := &models.UsageEvent{
		ID:        eventID,
		AccountID: accountID,
		EventType: eventType,
		Quantity:  qty,
		CreatedAt: time.Now(),
	}
	if err := s.repo.RecordUsageEvent(ctx, event); err != nil {
		return fmt.Errorf("billing: record usage event: %w", err)
	}

	// Make Stripe API calls asynchronous so they don't block the hot path
	go func() {
		// Respect mock mode for load testing
		if os.Getenv("STRIPE_MODE") == "mock" {
			return
		}

		// Report to Stripe Meters API (not the legacy usage-records API).
		params := &stripe.BillingMeterEventParams{
			EventName: stripe.String(eventType),
			Payload: map[string]string{
				"stripe_customer_id": stripeCustomerID,
				"value":              fmt.Sprintf("%d", qty),
			},
		}
		
		metrics.StripeAPICallsTotal.Inc()
		_, err := meterevent.New(params)
		if err != nil {
			s.log.Error("failed to report stripe meter event for %s: %v", accountID, err)
		}
	}()
	return nil
}

// CheckBalance verifies the account hasn't exhausted its plan limits in Postgres.
// Stripe does NOT gate usage — this check must live in our request path.
// It caches the aggregated usage in Redis for a short TTL (30-60s).
func (s *Service) CheckBalance(ctx context.Context, accountID, resourceType string, planLimits map[string]int64) error {
	limit, ok := planLimits[resourceType]
	if !ok {
		return nil
	}

	cacheKey := fmt.Sprintf("usage:%s:%s", accountID, resourceType)
	cached, err := s.rdb.Get(ctx, cacheKey).Int64()
	if err == nil {
		if cached >= limit {
			return errors.New("billing: plan limit reached for " + resourceType)
		}
		return nil
	}
	if err != redis.Nil {
		s.log.Error("redis error getting balance for %s: %v", cacheKey, err)
	}

	used, err := s.repo.GetAggregatedUsage(ctx, accountID, resourceType)
	if err != nil {
		return err
	}
	
	// Cache for 60 seconds
	s.rdb.Set(ctx, cacheKey, used, 60*time.Second)

	if used >= limit {
		return errors.New("billing: plan limit reached for " + resourceType)
	}
	return nil
}

// GetAccountPlan fetches the plan for an account, preferring the Redis cache.
func (s *Service) GetAccountPlan(ctx context.Context, accountID string) (string, error) {
	cacheKey := fmt.Sprintf("plan:%s", accountID)
	
	// Try cache first
	plan, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		return plan, nil
	}
	if err != redis.Nil {
		s.log.Error("redis error getting plan for %s: %v", cacheKey, err)
	}
	
	v, err, _ := s.sfGroup.Do(cacheKey, func() (interface{}, error) {
		// Double check cache
		plan, err := s.rdb.Get(ctx, cacheKey).Result()
		if err == nil {
			return plan, nil
		}
		if err != redis.Nil {
			s.log.Error("redis error getting plan for %s in sf: %v", cacheKey, err)
		}

		acc, err := s.repo.GetAccountByID(ctx, accountID)
		if err != nil {
			return "", err
		}
		
		// Cache for 60 seconds
		s.rdb.Set(ctx, cacheKey, acc.Plan, 60*time.Second)
		return acc.Plan, nil
	})

	if err != nil {
		return "", err
	}
	return v.(string), nil
}

// HandleWebhook processes Stripe webhooks. Updates accounts.plan/status in Postgres.
// This is what the client sidebar reads for real-time plan status.
func (s *Service) HandleWebhook(ctx context.Context, payload []byte, sigHeader string) error {
	event, err := webhook.ConstructEvent(payload, sigHeader, s.webhookSecret)
	if err != nil {
		return fmt.Errorf("billing: webhook signature invalid: %w", err)
	}

	switch event.Type {
	case "customer.subscription.updated":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return err
		}
		plan := "free"
		status := "active"
		if sub.Status == stripe.SubscriptionStatusActive {
			// Determine plan from the price metadata or product name.
			if len(sub.Items.Data) > 0 && sub.Items.Data[0].Price != nil {
				plan = sub.Items.Data[0].Price.Nickname
			}
		}
		if sub.Status == stripe.SubscriptionStatusPastDue || sub.Status == stripe.SubscriptionStatusUnpaid {
			status = "suspended"
		}
		acc, err := s.repo.GetAccountByStripeCustomerID(ctx, sub.Customer.ID)
		if err != nil || acc == nil {
			return err
		}
		
		err = s.repo.UpdatePlan(ctx, acc.ID, plan, status)
		if err == nil {
			// Invalidate plan cache
			s.rdb.Del(ctx, fmt.Sprintf("plan:%s", acc.ID))
		}
		return err

	case "invoice.paid":
		// Subscription renewed — ensure status is active.
		var inv stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			return err
		}
		acc, err := s.repo.GetAccountByStripeCustomerID(ctx, inv.Customer.ID)
		if err != nil || acc == nil {
			return err
		}
		
		err = s.repo.UpdatePlan(ctx, acc.ID, acc.Plan, "active")
		if err == nil {
			// Invalidate plan cache
			s.rdb.Del(ctx, fmt.Sprintf("plan:%s", acc.ID))
		}
		return err
	}
	return nil
}

// ListMeters returns all Stripe Meters (for admin/debug purposes).
func (s *Service) ListMeters() ([]*stripe.BillingMeter, error) {
	var meters []*stripe.BillingMeter
	iter := meter.List(&stripe.BillingMeterListParams{})
	for iter.Next() {
		meters = append(meters, iter.BillingMeter())
	}
	return meters, iter.Err()
}

// ListInvoices returns the recent invoices for a Stripe customer.
func (s *Service) ListInvoices(ctx context.Context, stripeCustomerID string) ([]map[string]interface{}, error) {
	params := &stripe.InvoiceListParams{
		Customer: stripe.String(stripeCustomerID),
	}
	params.Filters.AddFilter("limit", "", "10")

	iter := invoice.List(params)
	var invoices []map[string]interface{}
	for iter.Next() {
		inv := iter.Invoice()
		invoices = append(invoices, map[string]interface{}{
			"id":     inv.ID,
			"date":   time.Unix(inv.Created, 0).Format(time.RFC3339),
			"amount": float64(inv.Total) / 100.0,
			"status": inv.Status,
		})
	}
	return invoices, iter.Err()
}

// ParseBody is a helper for reading raw webhook body without consuming it.
func ParseBody(r *http.Request) ([]byte, error) {
	return io.ReadAll(r.Body)
}

// GetAggregatedUsage returns the usage for a specific event type, utilizing Redis cache when possible.
func (s *Service) GetAggregatedUsage(ctx context.Context, accountID, eventType string) (int64, error) {
	cacheKey := fmt.Sprintf("usage:%s:%s", accountID, eventType)
	cached, err := s.rdb.Get(ctx, cacheKey).Int64()
	if err == nil {
		return cached, nil
	}
	if err != redis.Nil {
		s.log.Error("redis error getting aggregated usage for %s: %v", cacheKey, err)
	}

	v, err, _ := s.sfGroup.Do(cacheKey, func() (interface{}, error) {
		cached, err := s.rdb.Get(ctx, cacheKey).Int64()
		if err == nil {
			return cached, nil
		}
		if err != redis.Nil {
			s.log.Error("redis error getting aggregated usage for %s in sf: %v", cacheKey, err)
		}

		used, err := s.repo.GetAggregatedUsage(ctx, accountID, eventType)
		if err != nil {
			return int64(0), err
		}

		// Cache for 60 seconds
		s.rdb.Set(ctx, cacheKey, used, 60*time.Second)
		return used, nil
	})
	
	if err != nil {
		return 0, err
	}
	return v.(int64), nil
}

// AddFunds adds the specified amount (in cents) to the account's prepaid balance.
func (s *Service) AddFunds(ctx context.Context, accountID string, amount int64) (int64, error) {
	if amount <= 0 {
		return 0, errors.New("billing: amount must be greater than zero")
	}
	return s.repo.AddFunds(ctx, accountID, amount)
}

// CreatePortalSession creates a Stripe Customer Portal session for subscription management.
func (s *Service) CreatePortalSession(ctx context.Context, account *models.Account, returnURL string) (string, error) {
	var customerID string
	if account.StripeCustomerID != nil {
		customerID = *account.StripeCustomerID
	} else {
		// Create a new customer
		params := &stripe.CustomerParams{
			Email: stripe.String(account.Email),
			Metadata: map[string]string{
				"account_id": account.ID,
			},
		}
		cust, err := customer.New(params)
		if err != nil {
			return "", err
		}
		if err := s.repo.UpdateStripeCustomerID(ctx, account.ID, cust.ID); err != nil {
			return "", err
		}
		customerID = cust.ID
	}

	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(customerID),
		ReturnURL: stripe.String(returnURL),
	}
	sess, err := session.New(params)
	if err != nil {
		return "", err
	}
	return sess.URL, nil
}

// CreateCheckoutSession creates a Stripe Checkout session for a new subscription.
func (s *Service) CreateCheckoutSession(ctx context.Context, account *models.Account, priceID, returnURL string) (string, error) {
	var customerID string
	if account.StripeCustomerID != nil {
		customerID = *account.StripeCustomerID
	} else {
		// Create a new customer
		params := &stripe.CustomerParams{
			Email: stripe.String(account.Email),
			Metadata: map[string]string{
				"account_id": account.ID,
			},
		}
		cust, err := customer.New(params)
		if err != nil {
			return "", err
		}
		if err := s.repo.UpdateStripeCustomerID(ctx, account.ID, cust.ID); err != nil {
			return "", err
		}
		customerID = cust.ID
	}

	params := &stripe.CheckoutSessionParams{
		Customer:   stripe.String(customerID),
		Mode:       stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		SuccessURL: stripe.String(returnURL + "?success=true"),
		CancelURL:  stripe.String(returnURL + "?canceled=true"),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(1),
			},
		},
	}
	sess, err := checkoutsession.New(params)
	if err != nil {
		return "", err
	}
	return sess.URL, nil
}

