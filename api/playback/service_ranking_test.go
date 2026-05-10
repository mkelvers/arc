package playback

import (
	"testing"
)

func TestRankSources(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		sources []StreamSource
		quality string
		wantErr bool
	}{
		{
			name:    "empty sources returns error",
			sources: nil,
			quality: "best",
			wantErr: true,
		},
		{
			name: "filters empty URLs",
			sources: []StreamSource{
				{URL: "", Type: "mp4"},
				{URL: "https://example.com/v.mp4", Type: "mp4"},
			},
			quality: "best",
			wantErr: false,
		},
		{
			name: "deduplicates URLs",
			sources: []StreamSource{
				{URL: "https://a.com/v.mp4", Type: "mp4"},
				{URL: "https://b.com/v.mp4", Type: "m3u8"},
				{URL: "https://a.com/v.mp4", Type: "mp4"},
			},
			quality: "best",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			_, err := rankSources(tt.sources, tt.quality)
			if (err != nil) != tt.wantErr {
				t.Errorf("rankSources() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestRankSourcesOrdering(t *testing.T) {
	t.Parallel()

	sources := []StreamSource{
		{URL: "https://embed.com/v.mp4", Type: "embed", Provider: "streamwish"},
		{URL: "https://mp4.com/v.mp4", Type: "mp4", Provider: "s-mp4"},
		{URL: "https://m3u8.com/v.m3u8", Type: "m3u8", Provider: "default"},
		{URL: "https://unknown.com/v.mp4", Type: "unknown", Provider: "other"},
	}

	ranked, err := rankSources(sources, "best")
	if err != nil {
		t.Fatalf("rankSources() error = %v", err)
	}

	if len(ranked) != 4 {
		t.Fatalf("got %d sources, want 4", len(ranked))
	}

	if ranked[0].source.Type != "mp4" {
		t.Errorf("ranked[0] = %q, want mp4 (type priority: mp4 > m3u8 > unknown > embed)", ranked[0].source.Type)
	}
	if ranked[1].source.Type != "m3u8" {
		t.Errorf("ranked[1] = %q, want m3u8", ranked[1].source.Type)
	}
}

func TestRankSourcesWithQuality(t *testing.T) {
	t.Parallel()

	sources := []StreamSource{
		{URL: "https://a.com/v.mp4", Quality: "1080p", Type: "mp4"},
		{URL: "https://b.com/v.mp4", Quality: "720p", Type: "mp4"},
		{URL: "https://c.com/v.mp4", Quality: "480p", Type: "mp4"},
	}

	ranked, err := rankSources(sources, "1080p")
	if err != nil {
		t.Fatalf("rankSources() error = %v", err)
	}

	if ranked[0].source.Quality != "1080p" {
		t.Errorf("ranked[0].Quality = %q, want 1080p", ranked[0].source.Quality)
	}
}

func TestNormalizeQuality(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		quality  string
		wantNorm string
	}{
		{
			name:     "empty returns best",
			quality:  "",
			wantNorm: "best",
		},
		{
			name:     "lowercase best",
			quality:  "BEST",
			wantNorm: "best",
		},
		{
			name:     "with spaces",
			quality:  " 720p ",
			wantNorm: "720p",
		},
		{
			name:     "worst",
			quality:  "worst",
			wantNorm: "worst",
		},
		{
			name:     "specific quality",
			quality:  "1080p",
			wantNorm: "1080p",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := normalizeQuality(tt.quality)
			if got != tt.wantNorm {
				t.Errorf("normalizeQuality(%q) = %q, want %q", tt.quality, got, tt.wantNorm)
			}
		})
	}
}

func TestParseQualityValue(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		quality string
		want   int
	}{
		{
			name:    "auto returns 240",
			quality: "auto",
			want:    240,
		},
		{
			name:    "1080p extracts 1080",
			quality: "1080p",
			want:    1080,
		},
		{
			name:    "720 extracts 720",
			quality: "720",
			want:    720,
		},
		{
			name:    "fhd is treated as fhd",
			quality: "fhd",
			want:    0,
		},
		{
			name:    "empty returns 0",
			quality: "",
			want:    0,
		},
		{
			name:    "multiple digits stops at first non-digit",
			quality: "1080p60fps",
			want:    1080,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := parseQualityValue(tt.quality)
			if got != tt.want {
				t.Errorf("parseQualityValue(%q) = %d, want %d", tt.quality, got, tt.want)
			}
		})
	}
}

func TestQualityMatches(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		source  string
		target  string
		want    bool
	}{
		{
			name:   "exact match",
			source: "1080p",
			target: "1080p",
			want:   true,
		},
		{
			name:   "target in source",
			source: "1920x1080",
			target: "1080",
			want:   true,
		},
		{
			name:   "digit match",
			source: "1080p",
			target: "1080",
			want:   true,
		},
		{
			name:   "no match",
			source: "720p",
			target: "1080",
			want:   false,
		},
		{
			name:   "empty source returns false",
			source: "",
			target: "1080",
			want:   false,
		},
		{
			name:   "empty target returns true (empty always contained)",
			source: "1080p",
			target: "",
			want:   true,
		},
		{
			name:   "auto doesn't match specific",
			source: "auto",
			target: "1080",
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := qualityMatches(tt.source, tt.target)
			if got != tt.want {
				t.Errorf("qualityMatches(%q, %q) = %v, want %v", tt.source, tt.target, got, tt.want)
			}
		})
	}
}

func TestSourceQualityPriority(t *testing.T) {
	t.Parallel()

tests := []struct {
		name    string
		source  string
		target  string
		wantMin int
	}{
		{
			name:    "best mode favors higher quality",
			source:  "1080p",
			target:  "best",
			wantMin: 1080,
		},
		{
			name:    "worst mode penalizes higher quality",
			source:  "1080p",
			target:  "worst",
			wantMin: -2000,
		},
		{
			name:    "exact match gets bonus",
			source:  "1080p",
			target:  "1080p",
			wantMin: 2000,
		},
		{
			name:    "close match gets penalty but positive score",
			source:  "1080p",
			target:  "720p",
			wantMin: 500,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := sourceQualityPriority(tt.source, tt.target)

			if tt.wantMin != 0 && got < tt.wantMin {
				t.Errorf("sourceQualityPriority(%q, %q) = %d, want >= %d", tt.source, tt.target, got, tt.wantMin)
			}
		})
	}
}

func TestSourceTypePriorityLookup(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		sourceType string
		want   int
	}{
		{
			name:       "mp4 priority",
			sourceType: "mp4",
			want:      500,
		},
		{
			name:       "m3u8 priority",
			sourceType: "m3u8",
			want:      450,
		},
		{
			name:       "unknown uses fallback",
			sourceType: "unknown",
			want:      300,
		},
		{
			name:       "embed fallback",
			sourceType: "embed",
			want:      100,
		},
		{
			name:       "unrecognized uses fallback",
			sourceType: "video",
			want:      200,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := lookupPriority(sourceTypePriority, tt.sourceType, 200)
			if got != tt.want {
				t.Errorf("lookupPriority(sourceTypePriority, %q, 200) = %d, want %d", tt.sourceType, got, tt.want)
			}
		})
	}
}

func TestProviderPriorityLookup(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		provider   string
		want       int
	}{
		{
			name:      "s-mp4",
			provider: "s-mp4",
			want:     120,
		},
		{
			name:      "default",
			provider: "default",
			want:     115,
		},
		{
			name:      "yt-mp4",
			provider: "yt-mp4",
			want:     100,
		},
		{
			name:      "unknown uses fallback",
			provider: "unknown",
			want:     60,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := lookupPriority(providerPriority, tt.provider, 60)
			if got != tt.want {
				t.Errorf("lookupPriority(providerPriority, %q, 60) = %d, want %d", tt.provider, got, tt.want)
			}
		})
	}
}

func TestNormalizeSourceTypeFromProbe(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		source      StreamSource
		contentType string
		wantType    string
	}{
		{
			name:        "video/mp4 normalizes to mp4",
			source:      StreamSource{Type: "unknown"},
			contentType: "video/mp4",
			wantType:    "mp4",
		},
		{
			name:        "application/octet-stream unchanged",
			source:      StreamSource{Type: "mp4"},
			contentType: "application/octet-stream",
			wantType:    "mp4",
		},
		{
			name:        "mpegurl normalizes to m3u8",
			source:      StreamSource{Type: "unknown"},
			contentType: "application/vnd.apple.mpegurl",
			wantType:    "m3u8",
		},
		{
			name:        "video/mpegurl",
			source:      StreamSource{Type: "unknown"},
			contentType: "video/mpegurl",
			wantType:    "m3u8",
		},
		{
			name:        "case insensitive",
			source:      StreamSource{Type: "unknown"},
			contentType: "VIDEO/MP4",
			wantType:    "mp4",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := normalizeSourceTypeFromProbe(tt.source, tt.contentType)
			if got.Type != tt.wantType {
				t.Errorf("normalizeSourceTypeFromProbe().Type = %q, want %q", got.Type, tt.wantType)
			}
		})
	}
}

func TestExtractDigits(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		value string
		want  string
	}{
		{
			name:  "extracts digits",
			value: "1080p",
			want:  "1080",
		},
		{
			name:  "empty if no digits",
			value: "p",
			want:  "",
		},
		{
			name:  "stops at non-digit after digits",
			value: "720p60",
			want:  "720",
		},
		{
			name:  "multiple non-digit does not break",
			value: "abc123def",
			want:  "123",
		},
		{
			name:  "all digits",
			value: "1080",
			want:  "1080",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := extractDigits(tt.value)
			if got != tt.want {
				t.Errorf("extractDigits(%q) = %q, want %q", tt.value, got, tt.want)
			}
		})
	}
}