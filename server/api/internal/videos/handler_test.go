package videos

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/motionmesh/server/api/internal/auth"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/shared/storage"
)

type mockVideoRepo struct {
	getVideoFunc func(id, accountID string) (*models.Video, error)
}

func (m *mockVideoRepo) GetByID(ctx context.Context, id, accountID string) (*models.Video, error) {
	if m.getVideoFunc != nil {
		return m.getVideoFunc(id, accountID)
	}
	return nil, nil
}
func (m *mockVideoRepo) ListByAccount(ctx context.Context, accountID string, externalUserID *string, limit int, cursor string) ([]*models.Video, error) { return nil, nil }
func (m *mockVideoRepo) GetPublicByID(ctx context.Context, id string) (*models.Video, error) { return nil, nil }
func (m *mockVideoRepo) Delete(ctx context.Context, id, accountID string) error { return nil }
func (m *mockVideoRepo) Create(ctx context.Context, video *models.Video) (*models.Video, error) { return nil, nil }
func (m *mockVideoRepo) Update(ctx context.Context, video *models.Video) error { return nil }
func (m *mockVideoRepo) IncViews(ctx context.Context, id string) error { return nil }
func (m *mockVideoRepo) SetThumbnailKeys(ctx context.Context, id, master string, small, medium, large *string) error { return nil }
func (m *mockVideoRepo) UpdateStatus(ctx context.Context, id, accountID string, status models.VideoStatus) error { return nil }

type mockStorage struct {
	storage.ObjectStorage
	getCookiesFunc func() (map[string]string, error)
}
func (m *mockStorage) GetCloudFrontSignedCookies(ctx context.Context, domain, prefix, keyID, privateKey string, ttl time.Duration) (map[string]string, error) {
	if m.getCookiesFunc != nil {
		return m.getCookiesFunc()
	}
	return map[string]string{"CloudFront-Signature": "valid"}, nil
}

func TestHandleGetPlaybackInfo_Authorization(t *testing.T) {
	repo := &mockVideoRepo{}
	svc := NewService(repo)
	store := &mockStorage{}
	
	h := NewHandler(svc, store, nil, nil, "bucket", "cfDomain", "media.motionmesh.co.in", "cfKey", "cfPrivateKey", 15*time.Minute, ".motionmesh.co.in", false)

	tests := []struct {
		name           string
		accountID      string
		videoID        string
		setupMock      func()
		expectedStatus int
	}{
		{
			name:      "Account A -> Video A = 200",
			accountID: "accA",
			videoID:   "vidA",
			setupMock: func() {
				repo.getVideoFunc = func(id, accID string) (*models.Video, error) {
					if id == "vidA" && accID == "accA" {
						return &models.Video{ID: "vidA", AccountID: "accA", Status: models.VideoStatusReady}, nil
					}
					return nil, nil // not found
				}
			},
			expectedStatus: http.StatusOK,
		},
		{
			name:      "Account A -> Video B = 403 (Actually 404/Not Found or 403 based on logic)",
			accountID: "accA",
			videoID:   "vidB",
			setupMock: func() {
				repo.getVideoFunc = func(id, accID string) (*models.Video, error) {
					// User does not own video B, so repo returns nil (or error)
					return nil, nil 
				}
			},
			expectedStatus: http.StatusNotFound, // Since repo returns nil for unowned, we expect 404
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			
			req := httptest.NewRequest("GET", "/"+tt.videoID+"/playback", nil)
			req = req.WithContext(context.WithValue(req.Context(), auth.AccountContextKey, &models.Account{ID: tt.accountID}))
			
			rctx := chi.NewRouteContext()
			rctx.URLParams.Add("id", tt.videoID)
			req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

			rec := httptest.NewRecorder()
			h.HandleGetPlaybackInfo(rec, req)

			if rec.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, rec.Code)
			}
		})
	}
}
