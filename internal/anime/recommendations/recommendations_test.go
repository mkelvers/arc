package recommendations

import (
	"database/sql"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"slices"
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
	}, 5.0, 0)
	nonMatching := scoreRecommendationCandidate(now, profile, jikan.Anime{
		MalID:      11,
		Genres:     []jikan.NamedEntity{{MalID: 2, Name: "Drama"}},
		Popularity: 100,
		Score:      8.0,
	}, 5.0, 0)

	if matching.score <= nonMatching.score {
		t.Fatalf("expected matching candidate to score higher, got matching=%f nonMatching=%f", matching.score, nonMatching.score)
	}
}

func TestScoreRecommendationCandidateBuildsRationaleFromProfileMatches(t *testing.T) {
	now := time.Date(2026, time.June, 4, 12, 0, 0, 0, time.UTC)
	profile := userTasteProfile{
		genres:       map[int]float64{1: 2.0},
		themes:       map[int]float64{10: 1.5},
		studios:      map[int]float64{20: 1.0},
		demographics: map[int]float64{30: 1.0},
	}

	candidate := scoreRecommendationCandidate(now, profile, jikan.Anime{
		MalID:        10,
		Genres:       []jikan.NamedEntity{{MalID: 1, Name: "Action"}},
		Themes:       []jikan.NamedEntity{{MalID: 10, Name: "School"}},
		Studios:      []jikan.NamedEntity{{MalID: 20, Name: "Production I.G"}},
		Demographics: []jikan.NamedEntity{{MalID: 30, Name: "Shounen"}},
	}, 5.0, 0)

	want := []string{"Action", "School", "Production I.G", "Shounen"}
	if !slices.Equal(candidate.rationale, want) {
		t.Fatalf("expected profile match rationale %v, got %v", want, candidate.rationale)
	}
}

func TestScoreRecommendationCandidateOmitsRationaleWhenSignalsAreWeak(t *testing.T) {
	now := time.Date(2026, time.June, 4, 12, 0, 0, 0, time.UTC)
	profile := userTasteProfile{
		genres:       map[int]float64{1: 2.0},
		themes:       map[int]float64{},
		studios:      map[int]float64{},
		demographics: map[int]float64{},
	}

	candidate := scoreRecommendationCandidate(now, profile, jikan.Anime{
		MalID: 10,
	}, 5.0, 0)

	if len(candidate.rationale) != 0 {
		t.Fatalf("expected no rationale for weak signals, got %v", candidate.rationale)
	}
}

func TestBuildTasteProfileUsesSeedWeights(t *testing.T) {
	now := time.Date(2026, time.June, 4, 12, 0, 0, 0, time.UTC)

	profile := buildTasteProfile(
		now,
		[]recommendationSeed{
			{animeID: 1, weight: 2.0},
			{animeID: 2, weight: 0.5},
		},
		[]jikan.Anime{
			{
				MalID:        1,
				Airing:       true,
				Year:         2026,
				Genres:       []jikan.NamedEntity{{MalID: 1, Name: "Action"}},
				Themes:       []jikan.NamedEntity{{MalID: 10, Name: "Team Sports"}},
				Studios:      []jikan.NamedEntity{{MalID: 20, Name: "Production I.G"}},
				Demographics: []jikan.NamedEntity{{MalID: 30, Name: "Shounen"}},
			},
			{
				MalID:        2,
				Year:         2001,
				Genres:       []jikan.NamedEntity{{MalID: 2, Name: "Drama"}},
				Themes:       []jikan.NamedEntity{{MalID: 11, Name: "School"}},
				Studios:      []jikan.NamedEntity{{MalID: 21, Name: "Madhouse"}},
				Demographics: []jikan.NamedEntity{{MalID: 31, Name: "Seinen"}},
			},
		},
	)

	if profile.genres[1] <= profile.genres[2] {
		t.Fatalf("expected stronger seed genre to carry more weight, got profile=%+v", profile.genres)
	}
	if !profile.prefersAiring {
		t.Fatal("expected weighted profile to prefer airing anime")
	}
	if !profile.prefersRecent {
		t.Fatal("expected weighted profile to prefer recent anime")
	}
}

func TestBuildProfileSearchQueriesIncludesTasteSignals(t *testing.T) {
	profile := userTasteProfile{
		genres: map[int]float64{
			1: 2.0,
			2: 1.5,
			3: 0.2,
		},
		themes: map[int]float64{
			10: 1.4,
		},
		studios: map[int]float64{
			20: 1.0,
		},
		demographics: map[int]float64{
			30: 1.2,
		},
	}

	queries := buildProfileSearchQueries(profile)

	if !hasGenreSearchQuery(queries, 1) {
		t.Fatalf("expected strongest genre query, got %+v", queries)
	}
	if !hasGenreSearchQuery(queries, 10) {
		t.Fatalf("expected theme query, got %+v", queries)
	}
	if !hasGenreSearchQuery(queries, 30) {
		t.Fatalf("expected demographic query, got %+v", queries)
	}
	if !hasStudioSearchQuery(queries, 20) {
		t.Fatalf("expected studio query, got %+v", queries)
	}
}

func TestRerankRecommendationCandidatesSpreadsRepeatedGenres(t *testing.T) {
	const sportsGenreID = 30

	candidates := []recommendationCandidate{
		{anime: testRecommendationAnime(1, sportsGenreID), score: 10},
		{anime: testRecommendationAnime(2, sportsGenreID), score: 9.9},
		{anime: testRecommendationAnime(3, sportsGenreID), score: 9.8},
		{anime: testRecommendationAnime(4, sportsGenreID), score: 9.7},
		{anime: testRecommendationAnime(5, sportsGenreID), score: 9.6},
		{anime: testRecommendationAnime(6, 1), score: 9.5},
		{anime: testRecommendationAnime(7, 2), score: 9.4},
		{anime: testRecommendationAnime(8, 3), score: 9.3},
	}

	reranked := rerankRecommendationCandidates(candidates, 8)
	if len(reranked) < 5 {
		t.Fatalf("expected enough reranked candidates, got %d", len(reranked))
	}

	for i := 0; i <= len(reranked)-5; i++ {
		if allHaveGenre(reranked[i:i+5], sportsGenreID) {
			t.Fatalf("expected reranker to avoid five sports anime in a row, got %+v", animeIDs(reranked))
		}
	}
}

func TestCandidateScoreLimitTracksRequestedResultSize(t *testing.T) {
	if got := candidateScoreLimit(TopPickLimit); got != TopPickLimit+candidateFetchBuffer {
		t.Fatalf("expected top-pick scoring to fetch a small oversample, got %d", got)
	}
	if got := candidateScoreLimit(TopPicksLimit); got != candidateFetchLimit {
		t.Fatalf("expected full top-picks scoring to keep existing cap, got %d", got)
	}
	if got := candidateScoreLimit(0); got != 0 {
		t.Fatalf("expected zero result limit to skip scoring, got %d", got)
	}
}

func testRecommendationAnime(id int, genreID int) jikan.Anime {
	return jikan.Anime{
		MalID:  id,
		Genres: []jikan.NamedEntity{{MalID: genreID, Name: "Genre"}},
	}
}

func allHaveGenre(animes []domain.Anime, genreID int) bool {
	for _, anime := range animes {
		hasGenre := false
		for _, genre := range anime.Genres {
			if genre.MalID == genreID {
				hasGenre = true
				break
			}
		}
		if !hasGenre {
			return false
		}
	}
	return true
}

func animeIDs(animes []domain.Anime) []int {
	ids := make([]int, 0, len(animes))
	for _, anime := range animes {
		ids = append(ids, anime.MalID)
	}
	return ids
}

func hasGenreSearchQuery(queries []profileSearchQuery, genreID int) bool {
	for _, query := range queries {
		if slices.Contains(query.genreIDs, genreID) {
			return true
		}
	}
	return false
}

func hasStudioSearchQuery(queries []profileSearchQuery, studioID int) bool {
	for _, query := range queries {
		if query.studioID == studioID {
			return true
		}
	}
	return false
}
