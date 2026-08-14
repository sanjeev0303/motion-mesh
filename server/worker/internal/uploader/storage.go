package uploader

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/motionmesh/server/shared/storage"
)

type UploadedFile struct {
	Key         string
	SizeBytes   int64
	ContentType string
}


type Uploader struct {
	store storage.ObjectStorage
}

func NewUploader(store storage.ObjectStorage) *Uploader {
	return &Uploader{store: store}
}

func (u *Uploader) uploadFile(ctx context.Context, filePath, objectKey, contentType string, bucketID *string) (int64, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return 0, fmt.Errorf("failed to read file %s: %w", filePath, err)
	}

	store := u.store

	if err := store.PutObject(ctx, objectKey, data, contentType); err != nil {
		return 0, fmt.Errorf("failed to upload %s: %w", objectKey, err)
	}

	return int64(len(data)), nil
}

// UploadRendition uploads the rendition's m3u8 playlist. The TS segments must be uploaded separately if needed,
// but usually we upload the whole directory. Let's make a method to upload a whole directory of HLS files.
func (u *Uploader) UploadHLS(ctx context.Context, videoID string, dirPath string, bucketID *string) ([]UploadedFile, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read hls dir: %w", err)
	}

	type uploadTask struct {
		filePath    string
		objectKey   string
		contentType string
	}

	tasks := make([]uploadTask, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		fileName := entry.Name()
		filePath := filepath.Join(dirPath, fileName)
		objectKey := fmt.Sprintf("videos/%s/hls/%s", videoID, fileName)

		contentType := "application/octet-stream"
		if strings.HasSuffix(fileName, ".m3u8") {
			contentType = "application/vnd.apple.mpegurl"
		} else if strings.HasSuffix(fileName, ".ts") {
			contentType = "video/mp2t"
		}
		tasks = append(tasks, uploadTask{filePath, objectKey, contentType})
	}

	// Upload concurrently with a bounded goroutine pool.
	// 8 workers saturates B2 bandwidth without hitting per-IP rate limits.
	const workers = 8
	taskCh := make(chan uploadTask, len(tasks))
	for _, t := range tasks {
		taskCh <- t
	}
	close(taskCh)

	var mu sync.Mutex
	var uploadedFiles []UploadedFile

	errCh := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for t := range taskCh {
				if ctx.Err() != nil {
					return
				}
				size, err := u.uploadFile(ctx, t.filePath, t.objectKey, t.contentType, bucketID)
				if err != nil {
					errCh <- err
					return
				}
				mu.Lock()
				uploadedFiles = append(uploadedFiles, UploadedFile{
					Key:         t.objectKey,
					SizeBytes:   size,
					ContentType: t.contentType,
				})
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	close(errCh)

	if err := <-errCh; err != nil {
		return nil, err
	}
	return uploadedFiles, nil
}

func (u *Uploader) UploadCaption(ctx context.Context, videoID, lang, vttContent string, bucketID *string) (UploadedFile, error) {
	objectKey := fmt.Sprintf("videos/%s/captions/%s.vtt", videoID, lang)
	
	store := u.store
	
	data := []byte(vttContent)
	if err := store.PutObject(ctx, objectKey, data, "text/vtt"); err != nil {
		return UploadedFile{}, fmt.Errorf("failed to upload caption: %w", err)
	}

	return UploadedFile{Key: objectKey, SizeBytes: int64(len(data)), ContentType: "text/vtt"}, nil
}

func (u *Uploader) UploadSprite(ctx context.Context, videoID, filePath string, bucketID *string) (UploadedFile, error) {
	objectKey := fmt.Sprintf("videos/%s/thumbnails/sprite.jpg", videoID)
	size, err := u.uploadFile(ctx, filePath, objectKey, "image/jpeg", bucketID)
	if err != nil {
		return UploadedFile{}, err
	}
	return UploadedFile{Key: objectKey, SizeBytes: size, ContentType: "image/jpeg"}, nil
}

func (u *Uploader) UploadPoster(ctx context.Context, videoID, filePath string, bucketID *string) (UploadedFile, error) {
	objectKey := fmt.Sprintf("videos/%s/thumbnails/poster.jpg", videoID)
	size, err := u.uploadFile(ctx, filePath, objectKey, "image/jpeg", bucketID)
	if err != nil {
		return UploadedFile{}, err
	}
	return UploadedFile{Key: objectKey, SizeBytes: size, ContentType: "image/jpeg"}, nil
}

func (u *Uploader) UploadPreview(ctx context.Context, videoID, filePath string, bucketID *string) (UploadedFile, error) {
	objectKey := fmt.Sprintf("videos/%s/thumbnails/preview.mp4", videoID)
	size, err := u.uploadFile(ctx, filePath, objectKey, "video/mp4", bucketID)
	if err != nil {
		return UploadedFile{}, err
	}
	return UploadedFile{Key: objectKey, SizeBytes: size, ContentType: "video/mp4"}, nil
}
