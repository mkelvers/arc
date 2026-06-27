package playback

import (
	"mal/internal/domain"
	"testing"
	"time"
)

func TestFallbackModes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		mode string
		want []string
	}{
		{name: "sub falls back to dub", mode: "sub", want: []string{"dub"}},
		{name: "dub falls back to sub", mode: "dub", want: []string{"sub"}},
		{name: "unknown tries both canonical modes", mode: "raw", want: []string{"sub", "dub"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := fallbackModes(tt.mode)
			if len(got) != len(tt.want) {
				t.Fatalf("len(got) = %d, want %d", len(got), len(tt.want))
			}
			for i, want := range tt.want {
				if got[i] != want {
					t.Fatalf("got[%d] = %q, want %q", i, got[i], want)
				}
			}
		})
	}
}

func TestEpisodeAvailabilityWarning(t *testing.T) {
	now := time.Date(2026, time.June, 27, 11, 0, 0, 0, time.UTC)
	tests := []struct {
		name string
		list domain.CanonicalEpisodeList
		want string
	}{
		{
			name: "fresh availability does not warn",
			list: domain.CanonicalEpisodeList{
				Episodes:      []domain.CanonicalEpisode{{Number: 1, HasSub: true}},
				LastSuccessAt: "2026-06-27T10:00:00Z",
				NextRefreshAt: "2026-06-27T12:00:00Z",
			},
		},
		{
			name: "stale availability warns",
			list: domain.CanonicalEpisodeList{
				Episodes:      []domain.CanonicalEpisode{{Number: 1, HasSub: true}},
				LastSuccessAt: "2026-06-27T09:00:00Z",
				NextRefreshAt: "2026-06-27T10:00:00Z",
			},
			want: episodeAvailabilityUncertainWarning,
		},
		{
			name: "retrying availability warns",
			list: domain.CanonicalEpisodeList{
				Episodes:      []domain.CanonicalEpisode{{Number: 1, HasSub: true}},
				NextRefreshAt: "2026-06-27T11:05:00Z",
				RetryUntilAt:  "2026-06-27T11:30:00Z",
				FailureCount:  1,
			},
			want: episodeAvailabilityUncertainWarning,
		},
		{
			name: "failed availability warns",
			list: domain.CanonicalEpisodeList{
				Episodes:     []domain.CanonicalEpisode{{Number: 1, HasSub: true}},
				FailureCount: 3,
			},
			want: episodeAvailabilityUncertainWarning,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := episodeAvailabilityWarning(tt.list, now)
			if got != tt.want {
				t.Fatalf("episodeAvailabilityWarning() = %q, want %q", got, tt.want)
			}
		})
	}
}
