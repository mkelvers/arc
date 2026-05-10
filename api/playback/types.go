package playback

// StreamSource represents a video stream from a provider.
type StreamSource struct {
	URL                string
	Quality            string
	Provider           string
	Type               string // m3u8, mp4, embed, unknown
	Referer            string
	Subtitles          []Subtitle
	AvailableQualities []StreamSource
}

type Subtitle struct {
	Lang string
	URL  string
}

type ModeSource struct {
	URL       string         `json:"url,omitempty"`
	Referer   string         `json:"referer,omitempty"`
	Token     string         `json:"token"`
	Subtitles []SubtitleItem `json:"subtitles"`
	Qualities []string       `json:"qualities,omitempty"`
}

type SubtitleItem struct {
	Lang    string `json:"lang"`
	URL     string `json:"url,omitempty"`
	Referer string `json:"referer,omitempty"`
	Token   string `json:"token"`
}

type SkipSegment struct {
	Type  string  `json:"type"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

// WatchPageData is the response payload for the watch page frontend.
type WatchPageData struct {
	MalID            int
	Title            string
	CurrentEpisode   string
	StartTimeSeconds float64
	CurrentStatus    string
	InitialMode      string
	AvailableModes   []string
	ModeSources      map[string]ModeSource
	Segments         []SkipSegment
	FallbackEpisodes map[string]int
}
