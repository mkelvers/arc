package playback

import (
	"testing"

	"mal/integrations/tmdb"
	"mal/internal/domain"
)

func TestLocalTMDBSeasonEpisodeTitlesUsesReleaseLocalNumbers(t *testing.T) {
	titles := localTMDBSeasonEpisodeTitles([]tmdb.Episode{
		{EpisodeNumber: 13, Name: "A New Season"},
		{EpisodeNumber: 14, Name: "The Next Episode"},
	})
	if titles[1] != "A New Season" || titles[2] != "The Next Episode" {
		t.Fatalf("titles = %+v", titles)
	}
}

func TestMappedSegmentEpisodeUsesMatchedInventoryWhenStoredRangeIsWrong(t *testing.T) {
	segment := domain.AnimeMediaSegment{
		Season:           3,
		SourceEpisodeMin: 1,
		SourceEpisodeMax: 11,
		TMDBEpisodeMin:   14,
		TMDBEpisodeMax:   24,
	}
	number, title, ok := mappedSegmentEpisode(segment, tmdb.Episode{
		EpisodeNumber: 50,
		Name:          "The Strongest Man",
	}, 0, 11)
	if !ok || number != 1 || title != "The Strongest Man" {
		t.Fatalf("mapped episode = %d, %q, %v; want 1, title, true", number, title, ok)
	}
}
