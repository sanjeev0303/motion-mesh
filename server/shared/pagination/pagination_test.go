package pagination

import (
	"testing"
	"time"
	"encoding/base64"

	"github.com/google/uuid"
)

func TestCursorValidation(t *testing.T) {
	validID := uuid.New().String()
	now := time.Now()

	tests := []struct {
		name    string
		cursor  any
		raw     string
		wantErr bool
	}{
		{
			name: "valid video cursor",
			cursor: VideoCursor{
				CreatedAt: now,
				ID:        validID,
				Ver:       1,
			},
			wantErr: false,
		},
		{
			name: "invalid version",
			cursor: VideoCursor{
				CreatedAt: now,
				ID:        validID,
				Ver:       2,
			},
			wantErr: true,
		},
		{
			name: "zero timestamp",
			cursor: VideoCursor{
				ID:  validID,
				Ver: 1,
			},
			wantErr: true,
		},
		{
			name: "invalid UUID",
			cursor: VideoCursor{
				CreatedAt: now,
				ID:        "not-a-uuid",
				Ver:       1,
			},
			wantErr: true,
		},
		{
			name:    "invalid base64",
			raw:     "invalid-base64-!@#$",
			wantErr: true,
		},
		{
			name:    "invalid json",
			raw:     base64.URLEncoding.EncodeToString([]byte(`{invalid json}`)),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			encoded := tt.raw
			if tt.cursor != nil {
				var err error
				encoded, err = EncodeCursor(tt.cursor)
				if err != nil {
					t.Fatalf("failed to encode: %v", err)
				}
			}

			_, err := DecodeCursor[VideoCursor](encoded)
			if (err != nil) != tt.wantErr {
				t.Errorf("DecodeCursor() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
