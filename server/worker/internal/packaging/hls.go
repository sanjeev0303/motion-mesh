package packaging

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/motionmesh/server/worker/internal/transcode"
)

// GenerateMasterPlaylist writes the master.m3u8 containing all renditions and subtitle tracks.
func GenerateMasterPlaylist(ctx context.Context, renditions []transcode.Rendition, captionLangs []string, outDir string) (string, error) {
	outPath := filepath.Join(outDir, "master.m3u8")

	var buf bytes.Buffer
	buf.WriteString("#EXTM3U\n")
	buf.WriteString("#EXT-X-VERSION:3\n")

	// Add video renditions
	for i, r := range renditions {
		// Map our simplified bitrates back to roughly bits per second for the manifest
		// Just a rough estimate for the manifest, we use the raw string "5000k" above
		bandwidth := 1000000 // default
		fmt.Sscanf(r.Bitrate, "%dk", &bandwidth)
		bandwidth *= 1000

		buf.WriteString(fmt.Sprintf("#EXT-X-STREAM-INF:BANDWIDTH=%d,RESOLUTION=%dx%d,NAME=\"%s\"\n", bandwidth, calculateWidth(r.Height), r.Height, r.Label))
		buf.WriteString(fmt.Sprintf("stream_%d.m3u8\n", i))
	}

	if err := os.WriteFile(outPath, buf.Bytes(), 0644); err != nil {
		return "", fmt.Errorf("failed to write master playlist: %w", err)
	}

	return outPath, nil
}

// GenerateCaptionPlaylist creates a simple m3u8 wrapper for a VTT file.
func GenerateCaptionPlaylist(ctx context.Context, lang string, outDir string) (string, error) {
	outPath := filepath.Join(outDir, fmt.Sprintf("%s.m3u8", lang))

	var buf bytes.Buffer
	buf.WriteString("#EXTM3U\n")
	buf.WriteString("#EXT-X-TARGETDURATION:10000\n") // arbitrary large duration
	buf.WriteString("#EXT-X-VERSION:3\n")
	buf.WriteString("#EXT-X-MEDIA-SEQUENCE:0\n")
	buf.WriteString("#EXTINF:10000.0,\n")
	buf.WriteString(fmt.Sprintf("%s.vtt\n", lang))
	buf.WriteString("#EXT-X-ENDLIST\n")

	if err := os.WriteFile(outPath, buf.Bytes(), 0644); err != nil {
		return "", fmt.Errorf("failed to write caption playlist: %w", err)
	}

	return outPath, nil
}

func calculateWidth(height int) int {
	return (height * 16) / 9
}
