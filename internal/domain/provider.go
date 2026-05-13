package domain

import (
	"context"
)

type StreamSource struct {
	URL     string
	Quality string
}

type StreamResult struct {
	URL        string
	Referer    string
	Subtitles  []Subtitle
	Qualities  []StreamSource
}

type Subtitle struct {
	URL   string
	Label string
}

type Provider interface {
	Name() string
	GetStreams(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string) (*StreamResult, error)
}
