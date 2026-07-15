package anime

import (
	"testing"

	"mal/integrations/tmdb"
)

func TestTMDBSeasonDisplaysHidesUnavailableSpecials(t *testing.T) {
	seasons := []tmdb.SeasonSummary{
		{SeasonNumber: 0, Name: "Specials", EpisodeCount: 26},
		{SeasonNumber: 1, Name: "Season 1", EpisodeCount: 38},
	}

	displays := tmdbSeasonDisplays(seasons, map[int]int{1: 28, 2: 10}, 1)
	if len(displays) != 1 || displays[0].Number != 1 {
		t.Fatalf("unexpected seasons without playable specials: %+v", displays)
	}

	displays = tmdbSeasonDisplays(seasons, map[int]int{0: 3, 1: 28}, 0)
	if len(displays) != 2 || displays[0].Number != 0 || displays[0].Count != 3 {
		t.Fatalf("playable specials were not included: %+v", displays)
	}
}

func TestAnimeEpisodeAirDate(t *testing.T) {
	if got := animeEpisodeAirDate("2026-02-13"); got != "02/13/2026" {
		t.Fatalf("animeEpisodeAirDate() = %q, want %q", got, "02/13/2026")
	}
}

func TestApplySelectedSeasonLabel(t *testing.T) {
	display := animeEpisodeListDisplay{
		SeasonLabel: "Season",
		Seasons: []animeSeasonDisplay{
			{Number: 1, Label: "Season 1"},
			{Number: 2, Label: "Season 2", Selected: true},
		},
	}

	applySelectedSeasonLabel(&display)
	if display.SeasonLabel != "Season 2" {
		t.Fatalf("SeasonLabel = %q, want %q", display.SeasonLabel, "Season 2")
	}
}
