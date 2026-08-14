package videos

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/motionmesh/server/api/internal/auth"
	"github.com/motionmesh/server/api/internal/buckets"
	"github.com/motionmesh/server/api/internal/transcode"
	"github.com/motionmesh/server/shared/logger"
	"github.com/motionmesh/server/shared/models"
	"github.com/motionmesh/server/shared/pagination"
	"github.com/motionmesh/server/shared/storage"
)

type Handler struct {
	svc          *Service
	storage      storage.ObjectStorage
	transcodeSvc *transcode.Service
	bucketSvc    *buckets.Service
	bucketID     string
	cfDomain     string
	cfMediaDomain  string
	cfKeyID        string
	cfPrivateKey   string
	cfPlaybackTTL  time.Duration
	cookieDomain   string
	mediaProxyMode bool
}

func NewHandler(svc *Service, storage storage.ObjectStorage, transcodeSvc *transcode.Service, bucketSvc *buckets.Service, bucketID, cfDomain, cfMediaDomain, cfKeyID, cfPrivateKey string, cfPlaybackTTL time.Duration, cookieDomain string, mediaProxyMode bool) *Handler {
	return &Handler{svc: svc, storage: storage, transcodeSvc: transcodeSvc, bucketSvc: bucketSvc, bucketID: bucketID, cfDomain: cfDomain, cfMediaDomain: cfMediaDomain, cfKeyID: cfKeyID, cfPrivateKey: cfPrivateKey, cfPlaybackTTL: cfPlaybackTTL, cookieDomain: cookieDomain, mediaProxyMode: mediaProxyMode}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/", h.HandleListVideos)
	r.Post("/", h.HandleUploadInitiation)
	
	// Multipart Uploads
	r.Post("/multipart", h.HandleMultipartInitiate)
	r.Get("/multipart/{id}/parts", h.HandleMultipartGetParts)
	r.Post("/multipart/{id}/complete", h.HandleMultipartComplete)

	r.Get("/{id}", h.HandleGetVideo)
	r.Delete("/{id}", h.HandleDeleteVideo)
	r.Get("/{id}/thumbnail", h.HandleGetThumbnail)
	r.Get("/{id}/playback", h.HandleGetPlaybackInfo)
	r.Post("/{id}/transcode", h.HandleCreateTranscodeJob)
	
	if h.mediaProxyMode {
		// HLS proxy: serves .m3u8 playlists and .ts segments from S3, solving CORS/auth
		r.Get("/{id}/hls/*", h.HandleHLSProxy)
	}
}

func (h *Handler) HandleListVideos(w http.ResponseWriter, r *http.Request) {
	acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	externalUserID := r.URL.Query().Get("external_user_id")
	var extUserID *string
	if externalUserID != "" {
		extUserID = &externalUserID
	}

	limitStr := r.URL.Query().Get("limit")
	limit, _ := strconv.Atoi(limitStr)
	cursor := r.URL.Query().Get("cursor")

	videos, err := h.svc.ListVideos(r.Context(), acc.ID, extUserID, limit, cursor)
	if err != nil {
		if err == pagination.ErrInvalidCursor {
			http.Error(w, "Invalid cursor format", http.StatusBadRequest)
			return
		}
		logger.New().Error("list videos: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if videos == nil {
		videos = make([]*models.Video, 0)
	}

	var nextCursor string
	if len(videos) == limit && len(videos) > 0 {
		lastVideo := videos[len(videos)-1]
		c := pagination.VideoCursor{
			CreatedAt: lastVideo.CreatedAt,
			ID:        lastVideo.ID,
		}
		if encoded, err := pagination.EncodeCursor(c); err == nil {
			nextCursor = encoded
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"videos":      videos,
		"next_cursor": nextCursor,
	})
}

func (h *Handler) HandleGetVideo(w http.ResponseWriter, r *http.Request) {
	acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	video, err := h.svc.GetVideo(r.Context(), id, acc.ID)
	if err != nil {
		logger.New().Error("get video: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if video == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(video)
}

func (h *Handler) HandleDeleteVideo(w http.ResponseWriter, r *http.Request) {
	acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	
	video, err := h.svc.GetVideo(r.Context(), id, acc.ID)
	if err != nil {
		logger.New().Error("get video to delete: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if video == nil {
		logger.New().Info("video not found or already deleted: %s", id)
		http.Error(w, "video not found", http.StatusNotFound)
		return
	}

	err = h.svc.DeleteVideo(r.Context(), id, acc.ID)
	if err != nil {
		logger.New().Error("delete video: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	logger.New().Info("successfully enqueued deletion for video id: %s", id)

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleUploadInitiation(w http.ResponseWriter, r *http.Request) {
	acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Filename          string  `json:"filename"`
		SizeBytes         float64 `json:"size_bytes"`
		BucketID          *string `json:"bucket_id,omitempty"`
		ExternalUserID    *string `json:"external_user_id,omitempty"`
		TranscodeBucketID *string `json:"transcode_bucket_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	logger.New().Info("Upload initiation req: %+v", req)

	objectKey := acc.ID + "/videos/" + req.Filename

	bucketID := h.bucketID
	if req.BucketID != nil && *req.BucketID != "" {
		bucketID = *req.BucketID
	}

	video := &models.Video{
		AccountID:         acc.ID,
		BucketID:          bucketID,
		TranscodeBucketID: req.TranscodeBucketID,
		ObjectKey:         objectKey,
		Title:             filepath.Base(req.Filename),
		SizeBytes:         req.SizeBytes,
		ExternalUserID:    req.ExternalUserID,
	}

	createdVideo, err := h.svc.InitiateUpload(r.Context(), video)
	if err != nil {
		logger.New().Error("create video record: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	uploadURL, err := h.storage.GetPresignedUploadURL(r.Context(), objectKey, "video/mp4")
	if err != nil {
		logger.New().Error("generate upload url: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"video":      createdVideo,
		"upload_url": uploadURL,
		"object_key": objectKey,
	})
}

func (h *Handler) HandleMultipartInitiate(w http.ResponseWriter, r *http.Request) {
	acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Filename          string  `json:"filename"`
		SizeBytes         float64 `json:"size_bytes"`
		BucketID          *string `json:"bucket_id,omitempty"`
		ExternalUserID    *string `json:"external_user_id,omitempty"`
		TranscodeBucketID *string `json:"transcode_bucket_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	objectKey := acc.ID + "/videos/" + req.Filename

	bucketID := h.bucketID
	if req.BucketID != nil && *req.BucketID != "" {
		bucketID = *req.BucketID
	}

	video := &models.Video{
		AccountID:         acc.ID,
		BucketID:          bucketID,
		TranscodeBucketID: req.TranscodeBucketID,
		ObjectKey:         objectKey,
		Title:             filepath.Base(req.Filename),
		SizeBytes:         req.SizeBytes,
		ExternalUserID:    req.ExternalUserID,
	}

	createdVideo, err := h.svc.InitiateUpload(r.Context(), video)
	if err != nil {
		logger.New().Error("create video record: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	uploadID, err := h.storage.CreateMultipartUpload(r.Context(), objectKey, "video/mp4")
	if err != nil {
		logger.New().Error("create multipart upload: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"video":      createdVideo,
		"upload_id":  uploadID,
		"object_key": objectKey,
	})
}

func (h *Handler) HandleMultipartGetParts(w http.ResponseWriter, r *http.Request) {
	acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	uploadID := r.URL.Query().Get("upload_id")
	if uploadID == "" {
		http.Error(w, "upload_id required", http.StatusBadRequest)
		return
	}
	
	startStr := r.URL.Query().Get("start")
	countStr := r.URL.Query().Get("count")
	
	start, err := strconv.Atoi(startStr)
	if err != nil || start < 1 {
		start = 1
	}
	count, err := strconv.Atoi(countStr)
	if err != nil || count < 1 {
		count = 10
	}
	
	video, err := h.svc.GetVideo(r.Context(), id, acc.ID)
	if err != nil || video == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	type partURL struct {
		PartNumber int    `json:"part_number"`
		URL        string `json:"url"`
	}
	
	var urls []partURL
	for i := 0; i < count; i++ {
		partNum := start + i
		u, err := h.storage.GetPresignedUploadPartURL(r.Context(), video.ObjectKey, uploadID, partNum)
		if err != nil {
			logger.New().Error("generate presigned part url: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		urls = append(urls, partURL{PartNumber: partNum, URL: u})
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"parts": urls,
	})
}

func (h *Handler) HandleMultipartComplete(w http.ResponseWriter, r *http.Request) {
	acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	video, err := h.svc.GetVideo(r.Context(), id, acc.ID)
	if err != nil || video == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	var req struct {
		UploadID string         `json:"upload_id"`
		Parts    []storage.Part `json:"parts"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	
	if err := h.storage.CompleteMultipartUpload(r.Context(), video.ObjectKey, req.UploadID, req.Parts); err != nil {
		logger.New().Error("complete multipart upload: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"completed"}`))
}




func (h *Handler) HandleGetThumbnail(w http.ResponseWriter, r *http.Request) {
	acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	video, err := h.svc.GetVideo(r.Context(), id, acc.ID)
	if err != nil || video == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if video.ThumbnailKey == nil {
		http.Error(w, "thumbnail not ready", http.StatusNotFound)
		return
	}

	url, err := h.storage.GetPresignedURL(r.Context(), *video.ThumbnailKey)
	if err != nil {
		logger.New().Error("presign thumbnail: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, url, http.StatusFound)
}

func (h *Handler) HandleCreateTranscodeJob(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	acc, ok := ctx.Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	videoID := chi.URLParam(r, "id")
	video, err := h.svc.GetVideo(ctx, videoID, acc.ID)
	if err != nil {
		logger.New().Error("get video: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if video == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Verify the object exists in storage and get its size
	size, err := h.storage.StatObject(ctx, video.ObjectKey)
	if err != nil || size <= 0 {
		logger.New().Error("stat object for transcode: %v", err)
		http.Error(w, "file not found in storage or empty", http.StatusBadRequest)
		return
	}

	// Record the uploaded source file in the bucket tracking table
	objRec := []models.BucketObject{
		{
			BucketID:    video.BucketID,
			Key:         video.ObjectKey,
			SizeBytes:   size,
			ContentType: "video/mp4",
		},
	}
	if err := h.bucketSvc.UpsertObjects(ctx, objRec); err != nil {
		logger.New().Error("upsert source object to bucket tracker: %v", err)
	}

	if err := h.transcodeSvc.TriggerJob(ctx, video); err != nil {
		logger.New().Error("trigger transcode job: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "queued"})
}

func (h *Handler) HandleGetPlaybackInfo(w http.ResponseWriter, r *http.Request) {
	acc, ok := r.Context().Value(auth.AccountContextKey).(*models.Account)
	if !ok || acc == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id := chi.URLParam(r, "id")
	video, err := h.svc.GetVideo(r.Context(), id, acc.ID)
	if err != nil {
		logger.New().Error("get video playback info: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if video == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if video.Status != models.VideoStatusReady {
		http.Error(w, "video not ready", http.StatusBadRequest)
		return
	}

	var playlistUrl string
	var subtitleUrl string
	var timelineSpritesUrl string

	if h.cfDomain != "" && h.cfKeyID != "" && h.cfPrivateKey != "" && h.cfMediaDomain != "" {
		// Use CloudFront with Signed Cookies to authorize the entire videos/{id}/* prefix
		prefix := fmt.Sprintf("videos/%s/*", video.ID)
		cookies, err := h.storage.GetCloudFrontSignedCookies(r.Context(), h.cfMediaDomain, prefix, h.cfKeyID, h.cfPrivateKey, h.cfPlaybackTTL)
		if err == nil {
			for k, v := range cookies {
				http.SetCookie(w, &http.Cookie{
					Name:     k,
					Value:    v,
					Path:     "/",
					Domain:   h.cookieDomain,
					Secure:   true,
					HttpOnly: true,
					SameSite: http.SameSiteNoneMode,
				})
			}
		} else {
			logger.New().Error("failed to generate signed cookies: %v", err)
		}

		playlistUrl = fmt.Sprintf("https://%s/videos/%s/hls/master.m3u8", h.cfMediaDomain, video.ID)
		
		if video.CaptionsStatus == "ready" {
			subtitleUrl = fmt.Sprintf("https://%s/videos/%s/captions/en.vtt", h.cfMediaDomain, video.ID)
		}
		if video.SpriteKey != nil {
			timelineSpritesUrl = fmt.Sprintf("https://%s/%s", h.cfMediaDomain, *video.SpriteKey)
		}
	} else if h.cfMediaDomain != "" {
		// Use CloudFront standard URLs without signed cookies
		playlistUrl = fmt.Sprintf("https://%s/videos/%s/hls/master.m3u8", h.cfMediaDomain, video.ID)
		if video.CaptionsStatus == "ready" {
			subtitleUrl = fmt.Sprintf("https://%s/videos/%s/captions/en.vtt", h.cfMediaDomain, video.ID)
		}
		if video.SpriteKey != nil {
			timelineSpritesUrl = fmt.Sprintf("https://%s/%s", h.cfMediaDomain, *video.SpriteKey)
		}
	} else if h.mediaProxyMode {
		// Use the HLS proxy URL instead of a presigned S3 URL.
		// This avoids CORS/401 issues: the browser fetches via our API which signs S3 requests.
		baseProxyURL := fmt.Sprintf("%s/v1/videos/%s/hls", getProxyBaseURL(r), video.ID)
		playlistUrl = fmt.Sprintf("%s/master.m3u8", baseProxyURL)

		if video.CaptionsStatus == "ready" {
			capKey := fmt.Sprintf("videos/%s/captions/en.vtt", video.ID)
			subtitleUrl, _ = h.storage.GetPresignedURL(r.Context(), capKey)
		}

		if video.SpriteKey != nil {
			timelineSpritesUrl, _ = h.storage.GetPresignedURL(r.Context(), *video.SpriteKey)
		}
	} else {
		// Fallback to S3 presigned URLs if no CloudFront and proxy disabled
		plKey := fmt.Sprintf("videos/%s/hls/master.m3u8", video.ID)
		playlistUrl, _ = h.storage.GetPresignedURL(r.Context(), plKey)
		if video.CaptionsStatus == "ready" {
			capKey := fmt.Sprintf("videos/%s/captions/en.vtt", video.ID)
			subtitleUrl, _ = h.storage.GetPresignedURL(r.Context(), capKey)
		}
		if video.SpriteKey != nil {
			timelineSpritesUrl, _ = h.storage.GetPresignedURL(r.Context(), *video.SpriteKey)
		}
	}

	response := map[string]interface{}{
		"playlistUrl":        playlistUrl,
		"subtitleUrl":        subtitleUrl,
		"timelineSpritesUrl": timelineSpritesUrl,
		"playerSettings": map[string]interface{}{
			"primaryColor": "#06b6d4",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleHLSProxy fetches HLS playlist and segment files from S3 and serves them
// to the browser. For .m3u8 playlists it rewrites relative URIs to go through
// this same proxy, so HLS.js never talks to S3 directly (no CORS/auth issues).
func (h *Handler) HandleHLSProxy(w http.ResponseWriter, r *http.Request) {
	videoID := chi.URLParam(r, "id")
	
	// Fetch the video without requiring an account context since HLS is public streaming
	video, err := h.svc.GetPublicVideo(r.Context(), videoID)
	if err != nil || video == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// The wildcard segment after /hls/ (e.g. "master.m3u8", "720p/stream.m3u8", "720p/seg001.ts")
	segPath := chi.URLParam(r, "*")

	// ── VTT caption files ────────────────────────────────────────────────────
	// Caption VTTs are stored under videos/{id}/captions/ by the worker, NOT
	// under hls/. Intercept *.vtt requests and proxy from the captions prefix.
	if strings.HasSuffix(segPath, ".vtt") {
		lang := strings.TrimSuffix(filepath.Base(segPath), ".vtt")
		vttKey := fmt.Sprintf("videos/%s/captions/%s.vtt", videoID, lang)
		body, err := h.storage.GetObjectStream(r.Context(), vttKey)
		if err != nil {
			logger.New().Error("hls proxy: vtt %s: %v", vttKey, err)
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		defer body.Close()
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		buf := make([]byte, 32*1024)
		for {
			n, err := body.Read(buf)
			if n > 0 {
				_, _ = w.Write(buf[:n])
			}
			if err != nil {
				break
			}
		}
		return
	}

	s3Key := fmt.Sprintf("videos/%s/hls/%s", videoID, segPath)

	body, err := h.storage.GetObjectStream(r.Context(), s3Key)
	if err != nil {
		logger.New().Error("hls proxy: get object %s: %v", s3Key, err)
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	defer body.Close()

	// Set CORS headers so the browser (or HLS.js) can load across origins
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")

	if strings.HasSuffix(segPath, ".m3u8") {
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Cache-Control", "no-cache")

		// Build the proxy base so relative URIs in the playlist are rewritten.
		// proxyDir is the directory of the current playlist file via the proxy.
		// e.g. for master.m3u8 → /v1/videos/{id}/hls
		//      for 720p/stream.m3u8 → /v1/videos/{id}/hls/720p
		proxyBase := fmt.Sprintf("%s/v1/videos/%s/hls", getProxyBaseURL(r), videoID)
		// directory relative to the playlist's own location
		slashIdx := strings.LastIndex(segPath, "/")
		if slashIdx >= 0 {
			proxyBase += "/" + segPath[:slashIdx]
		}

		isMaster := segPath == "master.m3u8"

		scanner := bufio.NewScanner(body)
		for scanner.Scan() {
			line := scanner.Text()

			// Strip subtitle EXT-X-MEDIA tags from master.m3u8 completely.
			// Vidstack handles captions via its own <Track> element (subtitleUrl
			// from the playback API), so letting HLS.js also load them causes
			// double-fetch and the broken hls/en.m3u8 → hls/en.vtt path error.
			if isMaster && strings.HasPrefix(line, "#EXT-X-MEDIA:TYPE=SUBTITLES") {
				continue
			}
			// Also strip the SUBTITLES= attribute from EXT-X-STREAM-INF lines
			// so HLS.js doesn't reference a now-absent subtitle group.
			if isMaster && strings.HasPrefix(line, "#EXT-X-STREAM-INF:") {
				line = strings.ReplaceAll(line, ",SUBTITLES=\"subs\"", "")
			}

			// Rewrite URI lines (non-comment, non-empty) to go through our proxy.
			// Leave absolute https:// lines untouched.
			if line != "" && !strings.HasPrefix(line, "#") && !strings.HasPrefix(line, "http") {
				line = proxyBase + "/" + line
			}
			fmt.Fprintln(w, line)
		}
		
		if err := scanner.Err(); err != nil {
			logger.New().Error("error scanning playlist: %v", err)
		}
		return
	}

	if strings.HasSuffix(segPath, ".ts") {
		w.Header().Set("Content-Type", "video/mp2t")
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	buf := make([]byte, 32*1024)
	for {
		n, err := body.Read(buf)
		if n > 0 {
			_, _ = w.Write(buf[:n])
		}
		if err != nil {
			break
		}
	}
}


func getProxyBaseURL(r *http.Request) string {
	if pub := os.Getenv("PUBLIC_API_URL"); pub != "" {
		return pub
	}

	scheme := "https"
	if r.TLS == nil {
		scheme = "http"
	}
	if fwdProto := r.Header.Get("X-Forwarded-Proto"); fwdProto != "" {
		scheme = fwdProto
	}

	host := r.Host
	if fwdHost := r.Header.Get("X-Forwarded-Host"); fwdHost != "" {
		host = fwdHost
	}

	return fmt.Sprintf("%s://%s", scheme, host)
}
