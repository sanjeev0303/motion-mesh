package packaging

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)


// GenerateSprite creates a 10x10 tiled sprite image for video scrubbing.
func GenerateSprite(ctx context.Context, inputPath string, duration float64, outDir string) (string, error) {
	outPath := filepath.Join(outDir, "sprite.jpg")
	
	// We want 100 frames total across the video duration.
	// FPS = 100 / duration.
	fps := 100.0 / duration
	if fps > 1 {
		fps = 1.0 // cap if video is very short
	}

	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-y",
		"-i", inputPath,
		"-vf", fmt.Sprintf("fps=%f,scale=160:90,tile=10x10", fps),
		"-frames:v", "1",
		"-q:v", "5",
		outPath,
	)

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to generate sprite: %w", err)
	}

	return outPath, nil
}

// GeneratePoster extracts a single frame at ~15% of the duration to use as the poster.
func GeneratePoster(ctx context.Context, inputPath string, duration float64, outDir string) (string, error) {
	outPath := filepath.Join(outDir, "poster.jpg")
	
	targetTime := duration * 0.15
	if targetTime < 1 && duration > 2 {
		targetTime = 1
	} else if targetTime >= duration {
		targetTime = duration / 2
	}

	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-y",
		"-ss", fmt.Sprintf("%f", targetTime),
		"-i", inputPath,
		"-frames:v", "1",
		"-q:v", "2",
		outPath,
	)

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to generate poster: %w", err)
	}

	return outPath, nil
}

// GeneratePreview creates a short, muted preview clip (6 seconds total from 4 evenly-spaced 1.5s windows).
// Uses a single -i with trim/concat rather than reopening the source file 4 times.
func GeneratePreview(ctx context.Context, inputPath string, duration float64, outDir string) (string, error) {
	outPath := filepath.Join(outDir, "preview.mp4")

	if duration < 6 {
		// Video too short — just copy, mute, scale.
		cmd := exec.CommandContext(ctx, "ffmpeg",
			"-y",
			"-i", inputPath,
			"-an",
			"-vf", "scale=-2:480",
			"-c:v", "libx264",
			"-preset", "fast",
			"-crf", "28",
			outPath,
		)
		if err := cmd.Run(); err != nil {
			return "", fmt.Errorf("failed to generate short preview: %w", err)
		}
		return outPath, nil
	}

	// Pick 4 windows spaced evenly, each 1.5s, using a single -i.
	spacing := duration / 5.0
	filterParts := make([]string, 0, 8)
	for i := 0; i < 4; i++ {
		start := spacing * float64(i+1)
		filterParts = append(filterParts,
			fmt.Sprintf("[0:v]trim=start=%f:duration=1.5,setpts=PTS-STARTPTS,scale=-2:480[v%d]", start, i),
		)
	}
	filterParts = append(filterParts, "[v0][v1][v2][v3]concat=n=4:v=1:a=0[outv]")

	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-y",
		"-i", inputPath,
		"-filter_complex", strings.Join(filterParts, ";"),
		"-map", "[outv]",
		"-an",
		"-c:v", "libx264",
		"-preset", "fast",
		"-crf", "28",
		outPath,
	)

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to generate preview: %w", err)
	}

	return outPath, nil
}
