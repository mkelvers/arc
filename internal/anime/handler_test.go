package anime

import (
	"context"
	"errors"
	"mal/integrations/jikan"
	"mal/internal/domain"
	"testing"
)

type stubEpisodeService struct {
	episodes domain.CanonicalEpisodeList
	err      error
	forced   bool
}

func (s *stubEpisodeService) GetCanonicalEpisodes(ctx context.Context, anime domain.Anime, forceRefresh bool) (domain.CanonicalEpisodeList, error) {
	s.forced = forceRefresh
	if s.err != nil {
		return domain.CanonicalEpisodeList{}, s.err
	}
	return s.episodes, nil
}

func (s *stubEpisodeService) RefreshTrackedDue(ctx context.Context, limit int) error {
	return nil
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
			name:   "jikan fallback source",
			source: "jikan_fallback",
			want:   "",
		},
		{
			name:   "legacy source",
			source: "legacy_disabled",
			want:   "",
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
			handler := NewAnimeHandler(nil, nil, episodeSvc)

			got := handler.animeAudioAvailability(context.Background(), domain.Anime{
				Anime: jikan.Anime{MalID: 52991},
			})
			if got != tt.want {
				t.Fatalf("animeAudioAvailability() = %q, want %q", got, tt.want)
			}
			if !episodeSvc.forced {
				t.Fatal("animeAudioAvailability() did not force provider refresh")
			}
		})
	}
}
