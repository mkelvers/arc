package anime

import (
	"database/sql"
	"mal/integrations/jikan"
	"mal/internal/db"
	"testing"
	"time"
)

func TestRecommendationEntryWeightPrioritizesCommittedRecentHistory(t *testing.T) {
	now := time.Date(2026, time.June, 4, 12, 0, 0, 0, time.UTC)

	completed := recommendationEntryWeight(now, db.GetUserWatchListRow{
		Status:         "completed",
		UpdatedAt:      now.Add(-24 * time.Hour),
		CurrentEpisode: sql.NullInt64{Int64: 12, Valid: true},
	})
	planned := recommendationEntryWeight(now, db.GetUserWatchListRow{
		Status:    "plan_to_watch",
		UpdatedAt: now.Add(-24 * time.Hour),
	})

	if completed <= planned {
		t.Fatalf("expected completed history to outrank planned history, got completed=%f planned=%f", completed, planned)
	}
}

func TestBuildRecommendationSeedsFiltersUnsupportedStatuses(t *testing.T) {
	now := time.Date(2026, time.June, 4, 12, 0, 0, 0, time.UTC)

	seeds := buildRecommendationSeeds(now, []db.GetUserWatchListRow{
		{AnimeID: 1, Status: "dropped", UpdatedAt: now},
		{AnimeID: 2, Status: "watching", UpdatedAt: now},
		{AnimeID: 3, Status: "completed", UpdatedAt: now},
	})

	if len(seeds) != 2 {
		t.Fatalf("expected 2 valid seeds, got %d", len(seeds))
	}
	if seeds[0].animeID != 2 || seeds[1].animeID != 3 {
		t.Fatalf("unexpected seed ordering: %+v", seeds)
	}
}

func TestScoreRecommendationCandidateRewardsProfileOverlap(t *testing.T) {
	now := time.Date(2026, time.June, 4, 12, 0, 0, 0, time.UTC)
	profile := userTasteProfile{
		genres: map[int]float64{
			1: 2.0,
		},
		themes:       map[int]float64{},
		studios:      map[int]float64{},
		demographics: map[int]float64{},
	}

	matching := scoreRecommendationCandidate(now, profile, jikan.Anime{
		MalID:      10,
		Genres:     []jikan.NamedEntity{{MalID: 1, Name: "Action"}},
		Popularity: 100,
		Score:      8.0,
	}, 5.0)
	nonMatching := scoreRecommendationCandidate(now, profile, jikan.Anime{
		MalID:      11,
		Genres:     []jikan.NamedEntity{{MalID: 2, Name: "Drama"}},
		Popularity: 100,
		Score:      8.0,
	}, 5.0)

	if matching.score <= nonMatching.score {
		t.Fatalf("expected matching candidate to score higher, got matching=%f nonMatching=%f", matching.score, nonMatching.score)
	}
}
