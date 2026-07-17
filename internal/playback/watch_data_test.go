package playback

import (
	"testing"

	"mal/integrations/tmdb"
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
