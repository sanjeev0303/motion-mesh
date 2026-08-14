package transcode

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/motionmesh/server/shared/models"
)

type TranscodeResult struct {
	Renditions map[string]string // label -> path to .m3u8
}

// Encode generates HLS streams for each rendition using FFmpeg.
func Encode(ctx context.Context, inputPath string, probe *ProbeResult, renditions []Rendition, watermark *models.WatermarkMetadata, outDir string, progressCb func(int)) (*TranscodeResult, error) {
	// Limit global thread count to avoid OOM when encoding multiple renditions.
	// With N renditions × "auto" threads each, libx264 can spawn 4–8 OS threads
	// per stream and exhaust container memory (signal: killed).
	// 2 global threads + per-stream x264 thread cap keeps RSS predictable.
	args := []string{
		"-y",
		"-threads", "2",
		"-i", inputPath,
	}

	// Setup watermark if active
	watermarkFilter := ""
	if watermark != nil && watermark.IsActive {
		args = append(args, "-i", watermark.AssetObjectKey) // Assuming AssetObjectKey points to a downloaded temp file for the watermark

		opacity := watermark.Opacity
		if opacity <= 0 {
			opacity = 0.8
		}

		// Simple mapping of position to overlay coordinates
		overlayPos := "W-w-10:H-h-10" // default bottom-right
		switch watermark.Position {
		case "top-left":
			overlayPos = "10:10"
		case "top-right":
			overlayPos = "W-w-10:10"
		case "bottom-left":
			overlayPos = "10:H-h-10"
		case "bottom-right":
			overlayPos = "W-w-10:H-h-10"
		}

		watermarkFilter = fmt.Sprintf("[1:v]format=argb,colorchannelmixer=aa=%f[wm];[0:v][wm]overlay=%s[vout]", opacity, overlayPos)
	}

	res := &TranscodeResult{
		Renditions: make(map[string]string),
	}

	var filterComplex []string
	if watermarkFilter != "" {
		filterComplex = append(filterComplex, watermarkFilter)
	}

	// Build -map and per-rendition options
	for i, r := range renditions {
		if watermarkFilter != "" {
			// If we have a watermark, scale the watermarked output [vout]
			scaleFilter := fmt.Sprintf("[vout]scale=-2:%d[v%d]", r.Height, i)
			filterComplex = append(filterComplex, scaleFilter)
			args = append(args, "-map", fmt.Sprintf("[v%d]", i))
		} else {
			// Without watermark, just scale the input [0:v]
			scaleFilter := fmt.Sprintf("[0:v]scale=-2:%d[v%d]", r.Height, i)
			filterComplex = append(filterComplex, scaleFilter)
			args = append(args, "-map", fmt.Sprintf("[v%d]", i))
		}
		
		// Map first audio stream from input (optional)
		args = append(args, "-map", "0:a:0?")

		// We use standard libx264 software encoding for maximum compatibility,
		// though a production setup might use h264_nvenc
		args = append(args,
			fmt.Sprintf("-c:v:%d", i), "libx264",
			fmt.Sprintf("-preset:%d", i), "veryfast",
			fmt.Sprintf("-b:v:%d", i), r.Bitrate,
			fmt.Sprintf("-maxrate:%d", i), r.Bitrate,
			fmt.Sprintf("-bufsize:%d", i), doubleBitrate(r.Bitrate),
			// threads=2: cap libx264's internal thread pool per-stream.
			// The global -threads flag only limits the lavf demuxer; libx264
			// allocates its own sliced-thread pool independently, and with
			// 5 renditions × auto-threads it spawns 7–18 OS threads each,
			// exhausting container RSS (signal: killed).
			fmt.Sprintf("-x264-params:v:%d", i), "threads=2:rc-lookahead=30",
			"-g", "72", // GOP = 6s × 25fps for 6s segments
			"-keyint_min", "72",
			"-sc_threshold", "0",
			fmt.Sprintf("-c:a:%d", i), "aac",
			fmt.Sprintf("-b:a:%d", i), "128k",
		)
	}

	if len(filterComplex) > 0 {
		args = append(args, "-filter_complex", strings.Join(filterComplex, ";"))
	}

	// HLS output configuration
	args = append(args,
		"-f", "hls",
		"-hls_time", "6",            // 6s segments → ~33% fewer files to upload
		"-hls_playlist_type", "vod",
		"-hls_segment_filename", filepath.Join(outDir, "stream_%v_data%03d.ts"),
		"-master_pl_name", "master.m3u8",
		"-var_stream_map", buildVarStreamMap(len(renditions)),
		filepath.Join(outDir, "stream_%v.m3u8"),
	)

	// Add progress tracking
	args = append(args, "-progress", "pipe:1")

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start ffmpeg: %w", err)
	}

	var stderrOutput string
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			stderrOutput += scanner.Text() + "\n"
		}
		if err := scanner.Err(); err != nil {
			stderrOutput += fmt.Sprintf("[stderr scan error: %v]", err)
		}
	}()

	// Parse progress asynchronously
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "out_time_ms=") {
				// Parse microseconds and convert to seconds
				msStr := strings.TrimPrefix(line, "out_time_ms=")
				if ms, err := strconv.ParseFloat(msStr, 64); err == nil {
					sec := ms / 1000000.0
					if probe.Duration > 0 && progressCb != nil {
						percent := int((sec / probe.Duration) * 100)
						if percent > 100 {
							percent = 100
						}
						progressCb(percent)
					}
				}
			}
		}
		if err := scanner.Err(); err != nil {
			fmt.Printf("Error reading ffmpeg progress: %v\n", err)
		}
	}()

	if err := cmd.Wait(); err != nil {
		return nil, fmt.Errorf("ffmpeg encode failed: %w, stderr: %s", err, stderrOutput)
	}

	for i, r := range renditions {
		res.Renditions[r.Label] = filepath.Join(outDir, fmt.Sprintf("stream_%d.m3u8", i))
	}

	return res, nil
}

func buildVarStreamMap(count int) string {
	var parts []string
	for i := 0; i < count; i++ {
		parts = append(parts, fmt.Sprintf("v:%d,a:%d", i, i))
	}
	return strings.Join(parts, " ")
}

// doubleBitrate parses a bitrate string like "2800k" and returns "5600k" (2×),
// used to set a proper VBV buffer size.
func doubleBitrate(bitrate string) string {
	bitrate = strings.TrimSpace(bitrate)
	suffix := ""
	numStr := bitrate
	if len(bitrate) > 0 {
		last := bitrate[len(bitrate)-1]
		if last == 'k' || last == 'K' || last == 'm' || last == 'M' {
			suffix = string(last)
			numStr = bitrate[:len(bitrate)-1]
		}
	}
	var val int
	if _, err := fmt.Sscanf(numStr, "%d", &val); err != nil || val <= 0 {
		return bitrate // fallback: return original unchanged
	}
	return fmt.Sprintf("%d%s", val*2, suffix)
}
