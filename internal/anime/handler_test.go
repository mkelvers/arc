package anime

import (
	"context"
	"errors"
	"mal/integrations/metadata"
	"mal/internal/domain"
	"testing"
	"time"
)

type stubEpisodeService struct {
	episodes     domain.CanonicalEpisodeList
	err          error
	called       int
	forceRefresh bool
}

func (s *stubEpisodeService) GetCanonicalEpisodes(ctx context.Context, anime domain.Anime, forceRefresh bool) (domain.CanonicalEpisodeList, error) {
	s.called++
	s.forceRefresh = forceRefresh
	if s.err != nil {
		return domain.CanonicalEpisodeList{}, s.err
	}
	return s.episodes, nil
}

func (s *stubEpisodeService) RefreshTrackedDue(ctx context.Context, limit int) error {
	return nil
}

type releasedCountTest struct {
	name  string
	anime domain.Anime
	now   time.Time
	want  int
}

var releasedCountTests = []releasedCountTest{
	{
		name: "weekly airing count",
		anime: domain.Anime{Anime: metadata.Anime{
			Airing:   true,
			Episodes: 24,
			Aired:    metadata.Aired{From: "2026-04-04T15:00:00+00:00"},
		}},
		now:  time.Date(2026, time.June, 13, 15, 0, 0, 0, time.UTC),
		want: 11,
	},
	{
		name: "before first release",
		anime: domain.Anime{Anime: metadata.Anime{
			Airing: true,
			Aired:  metadata.Aired{From: "2026-04-04T15:00:00+00:00"},
		}},
		now:  time.Date(2026, time.April, 4, 14, 59, 0, 0, time.UTC),
		want: 0,
	},
	{
		name: "first release counts as one",
		anime: domain.Anime{Anime: metadata.Anime{
			Airing: true,
			Aired:  metadata.Aired{From: "2026-04-04T15:00:00+00:00"},
		}},
		now:  time.Date(2026, time.April, 4, 15, 0, 0, 0, time.UTC),
		want: 1,
	},
	{
		name: "caps at total episode count",
		anime: domain.Anime{Anime: metadata.Anime{
			Airing:   true,
			Episodes: 12,
			Aired:    metadata.Aired{From: "2026-04-04T15:00:00+00:00"},
		}},
		now:  time.Date(2026, time.December, 1, 15, 0, 0, 0, time.UTC),
		want: 12,
	},
	{
		name: "unknown total still estimates current count",
		anime: domain.Anime{Anime: metadata.Anime{
			Airing: true,
			Aired:  metadata.Aired{From: "2026-04-04T15:00:00+00:00"},
		}},
		now:  time.Date(2026, time.April, 18, 15, 0, 0, 0, time.UTC),
		want: 3,
	},
	{
		name: "non airing anime is not estimated",
		anime: domain.Anime{Anime: metadata.Anime{
			Airing: false,
			Aired:  metadata.Aired{From: "2026-04-04T15:00:00+00:00"},
		}},
		now:  time.Date(2026, time.April, 18, 15, 0, 0, 0, time.UTC),
		want: 0,
	},
	{
		name: "invalid aired date is ignored",
		anime: domain.Anime{Anime: metadata.Anime{
			Airing: true,
			Aired:  metadata.Aired{From: "not-a-date"},
		}},
		now:  time.Date(2026, time.April, 18, 15, 0, 0, 0, time.UTC),
		want: 0,
	},
}

func TestReleasedEpisodeCount(t *testing.T) {
	for _, tt := range releasedCountTests {
		t.Run(tt.name, func(t *testing.T) {
			got := releasedEpisodeCount(tt.anime, tt.now)
			if got != tt.want {
				t.Fatalf("releasedEpisodeCount() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestAnimeReleaseInfoUsesCanonicalEpisodeCount(t *testing.T) {
	episodeSvc := &stubEpisodeService{
		episodes: domain.CanonicalEpisodeList{
			Source: "AllAnime",
			Episodes: []domain.CanonicalEpisode{
				{Number: 1},
				{Number: 2},
				{Number: 3},
			},
		},
	}
	handler := NewAnimeHandler(nil, nil, episodeSvc, nil)

	got := handler.animeReleaseInfo(context.Background(), domain.Anime{Anime: metadata.Anime{
		MalID:    59970,
		Airing:   true,
		Episodes: 12,
		Aired:    metadata.Aired{From: "2026-04-03T00:00:00+00:00"},
	}}, time.Date(2026, time.June, 21, 0, 0, 0, 0, time.UTC))

	if got.Count != 3 || got.Label != "Available episodes" {
		t.Fatalf("animeReleaseInfo() = %+v, want count=3 label=%q", got, "Available episodes")
	}
	if episodeSvc.called != 1 {
		t.Fatalf("GetCanonicalEpisodes() calls = %d, want 1", episodeSvc.called)
	}
	if episodeSvc.forceRefresh {
		t.Fatal("animeReleaseInfo() should use fresh cache when available")
	}
}

func TestAnimeReleaseInfoUsesCanonicalEpisodes(t *testing.T) {
	episodeSvc := &stubEpisodeService{
		episodes: domain.CanonicalEpisodeList{
			Source: "AllAnime",
			Episodes: []domain.CanonicalEpisode{
				{Number: 1},
				{Number: 2},
				{Number: 3},
			},
		},
	}
	handler := NewAnimeHandler(nil, nil, episodeSvc, nil)

	got := handler.animeReleaseInfo(context.Background(), domain.Anime{Anime: metadata.Anime{
		MalID:    59970,
		Status:   "Currently Airing",
		Airing:   true,
		Episodes: 12,
	}}, time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC))

	if got.Count != 3 || got.Label != "Available episodes" || got.Status != "Currently Airing" {
		t.Fatalf("animeReleaseInfo() = %+v, want 3 available episodes and current status", got)
	}
	if episodeSvc.called != 1 {
		t.Fatalf("GetCanonicalEpisodes() calls = %d, want 1", episodeSvc.called)
	}
}

func TestAnimeReleaseInfoMarksAiringAnimeWithoutCanonicalEpisodesAsNotYetAired(t *testing.T) {
	episodeSvc := &stubEpisodeService{
		episodes: domain.CanonicalEpisodeList{
			Source:         "AllAnime",
			ReleaseChecked: true,
			Episodes:       []domain.CanonicalEpisode{},
		},
	}
	handler := NewAnimeHandler(nil, nil, episodeSvc, nil)

	got := handler.animeReleaseInfo(context.Background(), domain.Anime{Anime: metadata.Anime{
		MalID:    62076,
		Status:   "Currently Airing",
		Airing:   true,
		Episodes: 6,
		Aired:    metadata.Aired{From: "2026-06-03T00:00:00+00:00"},
	}}, time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC))

	if got.Count != 0 || got.Label != "" || got.Status != "Not yet aired" {
		t.Fatalf("animeReleaseInfo() = %+v, want not-yet-aired status without count", got)
	}
}

func TestAnimeReleaseInfoStopsWhenCanonicalEpisodesAreEmpty(t *testing.T) {
	episodeSvc := &stubEpisodeService{
		episodes: domain.CanonicalEpisodeList{
			Source:   "AllAnime",
			Episodes: []domain.CanonicalEpisode{},
		},
	}
	handler := NewAnimeHandler(nil, nil, episodeSvc, nil)

	got := handler.animeReleaseInfo(context.Background(), domain.Anime{Anime: metadata.Anime{
		MalID:    62076,
		Airing:   true,
		Episodes: 12,
		Aired:    metadata.Aired{From: "2026-06-03T00:00:00+00:00"},
	}}, time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC))

	if got.Count != 0 || got.Label != "" {
		t.Fatalf("animeReleaseInfo() = %+v, want empty display", got)
	}
	if episodeSvc.called != 1 {
		t.Fatalf("GetCanonicalEpisodes() calls = %d, want 1", episodeSvc.called)
	}
}

func TestAnimeInitialReleaseInfoDoesNotTrustCurrentlyAiringMetadata(t *testing.T) {
	got := animeInitialReleaseInfo(domain.Anime{Anime: metadata.Anime{
		MalID:    62076,
		Status:   "Currently Airing",
		Airing:   true,
		Episodes: 6,
		Aired:    metadata.Aired{From: "2026-06-03T00:00:00+00:00"},
	}}, time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC))

	if got.Count != 0 || got.Label != "" || got.Status != "" {
		t.Fatalf("animeInitialReleaseInfo() = %+v, want empty unverified airing display", got)
	}
}

func TestAnimeReleaseInfoFallsBackToMetadata(t *testing.T) {
	episodeSvc := &stubEpisodeService{err: errors.New("provider unavailable")}
	handler := NewAnimeHandler(nil, nil, episodeSvc, nil)

	got := handler.animeReleaseInfo(context.Background(), domain.Anime{Anime: metadata.Anime{
		MalID:    59970,
		Airing:   false,
		Episodes: 12,
	}}, time.Date(2026, time.June, 21, 0, 0, 0, 0, time.UTC))

	if got.Count != 12 || got.Label != "Total episodes" {
		t.Fatalf("animeReleaseInfo() = %+v, want count=12 label=%q", got, "Total episodes")
	}
}

func TestAnimeInitialReleaseInfoDoesNotCallEpisodeService(t *testing.T) {
	episodeSvc := &stubEpisodeService{
		episodes: domain.CanonicalEpisodeList{
			Episodes: []domain.CanonicalEpisode{{Number: 1}, {Number: 2}, {Number: 3}},
		},
	}

	got := animeInitialReleaseInfo(domain.Anime{Anime: metadata.Anime{
		MalID:    59970,
		Airing:   true,
		Status:   "Currently Airing",
		Episodes: 12,
		Aired:    metadata.Aired{From: "2026-04-03T00:00:00+00:00"},
	}}, time.Date(2026, time.June, 21, 0, 0, 0, 0, time.UTC))

	if got.Count != 0 || got.Label != "" {
		t.Fatalf("animeInitialReleaseInfo() = %+v, want empty display", got)
	}
	if episodeSvc.called != 0 {
		t.Fatalf("GetCanonicalEpisodes() calls = %d, want 0", episodeSvc.called)
	}
}

func TestAnimeAudioAvailabilityLabel(t *testing.T) {
	tests := []struct {
		name     string
		episodes []domain.CanonicalEpisode
		want     string
	}{
		{
			name: "dub availability",
			episodes: []domain.CanonicalEpisode{
				{Number: 1, HasSub: true, HasDub: true},
			},
			want: "Dub available",
		},
		{
			name: "subtitled availability",
			episodes: []domain.CanonicalEpisode{
				{Number: 1, HasSub: true, SubOnly: true},
			},
			want: "Subtitled only",
		},
		{
			name:     "unknown availability",
			episodes: []domain.CanonicalEpisode{{Number: 1}},
			want:     "",
		},
		{
			name:     "no episodes",
			episodes: []domain.CanonicalEpisode{},
			want:     "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := animeAudioAvailabilityLabel(tt.episodes)
			if got != tt.want {
				t.Fatalf("animeAudioAvailabilityLabel() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestAnimeAudioAvailabilityRequiresAllAnimeSource(t *testing.T) {
	tests := []struct {
		name   string
		source string
		err    error
		want   string
	}{
		{
			name:   "allanime source",
			source: "AllAnime",
			want:   "Dub available",
		},
		{
			name: "provider error",
			err:  errors.New("provider unavailable"),
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			episodeSvc := &stubEpisodeService{
				episodes: domain.CanonicalEpisodeList{
					Source: tt.source,
					Episodes: []domain.CanonicalEpisode{
						{Number: 1, HasSub: true, HasDub: true},
					},
				},
				err: tt.err,
			}
			handler := NewAnimeHandler(nil, nil, episodeSvc, nil)

			got := handler.animeAudioAvailability(context.Background(), domain.Anime{
				Anime: metadata.Anime{MalID: 52991},
			})
			if got != tt.want {
				t.Fatalf("animeAudioAvailability() = %q, want %q", got, tt.want)
			}
			if !episodeSvc.forceRefresh {
				t.Fatal("animeAudioAvailability() did not force provider refresh")
			}
		})
	}
}
