package transcode

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
)

type ProbeResult struct {
	Duration  float64
	SizeBytes int64
	Width     int
	Height    int
	Codec     string
}

func Probe(ctx context.Context, inputPath string) (*ProbeResult, error) {
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "quiet",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		inputPath,
	)

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ffprobe failed: %w", err)
	}

	var data struct {
		Format struct {
			Duration string `json:"duration"`
			Size     string `json:"size"`
		} `json:"format"`
		Streams []struct {
			CodecType string `json:"codec_type"`
			CodecName string `json:"codec_name"`
			Width     int    `json:"width"`
			Height    int    `json:"height"`
		} `json:"streams"`
	}

	if err := json.Unmarshal(output, &data); err != nil {
		return nil, fmt.Errorf("failed to parse ffprobe json: %w", err)
	}

	res := &ProbeResult{}

	// Parse duration
	if d, err := strconv.ParseFloat(data.Format.Duration, 64); err == nil {
		res.Duration = d
	}

	// Parse size
	if s, err := strconv.ParseInt(data.Format.Size, 10, 64); err == nil {
		res.SizeBytes = s
	}

	// Find first video stream
	for _, stream := range data.Streams {
		if stream.CodecType == "video" {
			res.Width = stream.Width
			res.Height = stream.Height
			res.Codec = stream.CodecName
			break
		}
	}

	if res.Width == 0 || res.Height == 0 {
		return nil, fmt.Errorf("no video stream found in file")
	}

	return res, nil
}
