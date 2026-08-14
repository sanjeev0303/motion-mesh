package captions

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/motionmesh/server/shared/metrics"
	"github.com/motionmesh/server/shared/models"
)

type Provider interface {
	Transcribe(ctx context.Context, req TranscribeRequest) (*TranscribeResponse, error)
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{
		baseURL:    baseURL,
		httpClient: httpClient,
	}
}

type TranscribeRequest struct {
	AudioPath       string
	IncludeChapters bool
}

type Segment struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
}

type TranscribeResponse struct {
	TranscriptText string           `json:"transcript_text"`
	VTT            string           `json:"vtt"`
	Segments       []Segment        `json:"segments"`
	Chapters       []models.Chapter `json:"chapters"` // Uses the shared models.Chapter
}

func (c *Client) Transcribe(ctx context.Context, req TranscribeRequest) (*TranscribeResponse, error) {
	metrics.AIRequestsTotal.Inc()
	
	file, err := os.Open(req.AudioPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open audio file: %w", err)
	}
	defer file.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("audio", filepath.Base(req.AudioPath))
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, fmt.Errorf("failed to copy audio to form: %w", err)
	}

	if req.IncludeChapters {
		if err := writer.WriteField("include_chapters", "true"); err != nil {
			return nil, fmt.Errorf("failed to write include_chapters field: %w", err)
		}
	} else {
		if err := writer.WriteField("include_chapters", "false"); err != nil {
			return nil, fmt.Errorf("failed to write include_chapters field: %w", err)
		}
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	reqCtx, reqCancel := context.WithTimeout(ctx, 15*time.Minute)
	defer reqCancel()

	httpReq, err := http.NewRequestWithContext(reqCtx, "POST", c.baseURL+"/transcribe", body)
	if err != nil {
		return nil, fmt.Errorf("failed to create http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("sidecar returned %d: %s", resp.StatusCode, string(respBody))
	}

	var res TranscribeResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &res, nil
}

type MockProvider struct{}

func NewMockProvider() *MockProvider {
	return &MockProvider{}
}

func (m *MockProvider) Transcribe(ctx context.Context, req TranscribeRequest) (*TranscribeResponse, error) {
	metrics.AIRequestsTotal.Inc()
	
	// Simulate AI processing time
	time.Sleep(500 * time.Millisecond)
	
	// Return mock response
	res := &TranscribeResponse{
		TranscriptText: "This is a mock transcript.",
		VTT:            "WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\nThis is a mock transcript.",
		Segments: []Segment{
			{Start: 0, End: 5, Text: "This is a mock transcript."},
		},
	}
	
	if req.IncludeChapters {
		res.Chapters = []models.Chapter{
			{StartTimeSeconds: 0, Title: "Introduction"},
		}
	}
	
	return res, nil
}
