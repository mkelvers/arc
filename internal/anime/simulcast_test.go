package anime

import (
	"context"
	"fmt"
	"mal/integrations/playback/allanime"
	"testing"
	"time"
)

type seasonalProviderStub struct {
	shows map[string][]allanime.ProviderShow
}

func (p seasonalProviderStub) SeasonalShows(_ context.Context, season string, year int) ([]allanime.ProviderShow, error) {
	return p.shows[fmt.Sprintf("%s-%d", season, year)], nil
}

func TestAdjacentSeasonCrossesYearBoundary(t *testing.T) {
	previous := adjacentSeason("winter", 2026, -1)
	if previous.Season != "fall" || previous.Year != 2025 {
		t.Fatalf("previous = %+v", previous)
	}

	next := adjacentSeason("fall", 2026, 1)
	if next.Season != "winter" || next.Year != 2027 {
		t.Fatalf("next = %+v", next)
	}
}

func TestSeasonSelectionRejectsInvalidValues(t *testing.T) {
	now := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)
	current := calendarSeason(now.Year(), int(now.Month()))
	got := seasonSelection("monsoon", "nope", current, current)
	if got.Season != "summer" || got.Year != 2026 {
		t.Fatalf("seasonSelection = %+v", got)
	}
}

func TestSeasonSelectionDefaultsToCalendarSeasonWhenNewerSeasonIsAvailable(t *testing.T) {
	current := animeSeason{Season: "spring", Year: 2026}
	latest := animeSeason{Season: "summer", Year: 2026}
	got := seasonSelection("", "", current, latest)
	if got != current {
		t.Fatalf("seasonSelection = %+v, want %+v", got, current)
	}
}

func TestLatestAvailableSeasonIncludesPlayableNextSeason(t *testing.T) {
	provider := seasonalProviderStub{shows: map[string][]allanime.ProviderShow{
		"summer-2026": {{MalID: 1}},
	}}
	svc := newSeasonDiscoveryService(provider)
	got := svc.LatestAvailableSeason(context.Background(), animeSeason{Season: "spring", Year: 2026})
	if got.Season != "summer" || got.Year != 2026 {
		t.Fatalf("LatestAvailableSeason = %+v", got)
	}
}

func TestSeasonOptionsRunNewestFirstWithoutFutureSeasons(t *testing.T) {
	got := seasonOptions(2025, animeSeason{Season: "summer", Year: 2026})
	want := []string{"Summer 2026", "Spring 2026", "Winter 2026", "Fall 2025", "Summer 2025", "Spring 2025", "Winter 2025"}
	if len(got) != len(want) {
		t.Fatalf("len(seasonOptions) = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i].Label != want[i] {
			t.Fatalf("seasonOptions[%d] = %q, want %q", i, got[i].Label, want[i])
		}
	}
}

func TestSeasonNavigationStopsAtSupportedRange(t *testing.T) {
	current := animeSeason{Season: "summer", Year: 2026}
	if previous, _ := seasonNavigation(animeSeason{Season: "winter", Year: 2018}, 2018, current); previous != nil {
		t.Fatalf("previous = %+v, want nil", previous)
	}
	if _, next := seasonNavigation(current, 2018, current); next != nil {
		t.Fatalf("next = %+v, want nil", next)
	}
}

func TestParseSeasonDefaultsToCalendarSeason(t *testing.T) {
	got := calendarSeason(2026, 7)
	if got.Season != "summer" || got.Year != 2026 {
		t.Fatalf("calendarSeason = %+v", got)
	}
}
