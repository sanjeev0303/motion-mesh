package pagination

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

var ErrInvalidCursor = errors.New("pagination: invalid cursor")

type Validator interface {
	Validate() error
}

type VideoCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        string    `json:"id"`
	Ver       int       `json:"ver"`
}

func (c VideoCursor) Validate() error {
	if c.Ver != 1 {
		return ErrInvalidCursor
	}
	if c.CreatedAt.IsZero() {
		return ErrInvalidCursor
	}
	if _, err := uuid.Parse(c.ID); err != nil {
		return ErrInvalidCursor
	}
	return nil
}

type ObjectCursor struct {
	UploadedAt time.Time `json:"uploaded_at"`
	ID         string    `json:"id"`
	Ver        int       `json:"ver"`
}

func (c ObjectCursor) Validate() error {
	if c.Ver != 1 {
		return ErrInvalidCursor
	}
	if c.UploadedAt.IsZero() {
		return ErrInvalidCursor
	}
	if _, err := uuid.Parse(c.ID); err != nil {
		return ErrInvalidCursor
	}
	return nil
}

func EncodeCursor(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func DecodeCursor[T any](s string) (T, error) {
	var v T
	if s == "" {
		return v, nil
	}
	decoded, err := base64.URLEncoding.DecodeString(s)
	if err != nil {
		return v, ErrInvalidCursor
	}
	if err := json.Unmarshal(decoded, &v); err != nil {
		return v, ErrInvalidCursor
	}
	
	if val, ok := any(v).(Validator); ok {
		if err := val.Validate(); err != nil {
			return v, err
		}
	}
	
	return v, nil
}
