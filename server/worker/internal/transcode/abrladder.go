package transcode

type Rendition struct {
	Height  int
	Bitrate string
	Label   string
}

// BuildLadder generates a set of output renditions that don't upscale the source.
func BuildLadder(sourceHeight int) []Rendition {
	allRenditions := []Rendition{
		{Height: 1080, Bitrate: "5000k", Label: "1080p"},
		{Height: 720, Bitrate: "2800k", Label: "720p"},
		{Height: 480, Bitrate: "1400k", Label: "480p"},
		{Height: 360, Bitrate: "800k", Label: "360p"},
		{Height: 240, Bitrate: "400k", Label: "240p"},
	}

	var valid []Rendition
	for _, r := range allRenditions {
		// Only include renditions smaller than or equal to source.
		// If source is 1080p, we include 1080p and below.
		// If source is 4K (2160p), we include 1080p and below.
		// Note: we cap at 1080p for now as per usual ABR ladders unless 4K is explicitly requested.
		if sourceHeight >= r.Height || len(valid) == 0 { // at least one rendition
			valid = append(valid, r)
		}
	}

	// Fallback if source is tiny (e.g. 144p), ensure we at least output 240p
	if len(valid) == 0 {
		valid = append(valid, allRenditions[len(allRenditions)-1])
	}

	return valid
}
