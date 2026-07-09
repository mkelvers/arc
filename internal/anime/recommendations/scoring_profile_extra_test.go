package recommendations

import (
	"math"
	"testing"
	"time"

	"mal/integrations/metadata"
)

func TestProfileSearchRankWeightHasFloor(t *testing.T) {
	if got := profileSearchRankWeight(0); got != 1 {
		t.Fatalf("rank 0 weight = %f, want 1", got)
	}
	if got := profileSearchRankWeight(100); got != 0.35 {
		t.Fatalf("rank 100 weight = %f, want floor 0.35", got)
	}
}

func TestRankedCandidateRetrievalScoreUsesLogForCollaborativeSignal(t *testing.T) {
	low := rankedCandidateRetrievalScore(1, 0)
	high := rankedCandidateRetrievalScore(100, 0)
	if high <= low {
		t.Fatalf("expected higher collaborative score to rank higher, low=%f high=%f", low, high)
	}
	linearGrowth := 100.0 - 1.0
	actualGrowth := high - low
	if actualGrowth >= linearGrowth {
		t.Fatalf("expected log scaling, growth=%f linear=%f", actualGrowth, linearGrowth)
	}
}

func TestHasTasteMetadata(t *testing.T) {
	if hasTasteMetadata(metadata.Anime{}) {
		t.Fatalf("empty anime should not have taste metadata")
	}
	if !hasTasteMetadata(metadata.Anime{Studios: []metadata.NamedEntity{{MalID: 1}}}) {
		t.Fatalf("studio metadata should count as taste metadata")
	}
}

func TestRecommendationCandidateScoreAdjustments(t *testing.T) {
	now := time.Date(2026, time.June, 4, 12, 0, 0, 0, time.UTC)
	profile := userTasteProfile{prefersAiring: true, prefersRecent: true}

	preferred := recommendationCandidateScoreAdjustments(now, profile, metadata.Anime{
		Score:      9,
		Popularity: 10,
		Airing:     true,
		Year:       2026,
		Aired:      metadata.Aired{From: now.Add(-24 * time.Hour).Format(time.RFC3339)},
	})
	penalized := recommendationCandidateScoreAdjustments(now, profile, metadata.Anime{
		Score:  9,
		Year:   2000,
		Status: "Not yet aired",
	})

	if preferred <= penalized {
		t.Fatalf("expected preferred candidate to outscore penalized candidate, preferred=%f penalized=%f", preferred, penalized)
	}
	if !isRecentCandidate(now, 2024) || isRecentCandidate(now, 2010) {
		t.Fatalf("recent candidate boundary failed")
	}
	if !isClassicCandidate(now, 2010) || isClassicCandidate(now, 2020) {
		t.Fatalf("classic candidate boundary failed")
	}
	if !isFreshRelease(now, now.Add(-freshReleaseWindow+time.Hour).Format(time.RFC3339)) {
		t.Fatalf("expected fresh release inside window")
	}
	if isFreshRelease(now, "not a date") {
		t.Fatalf("invalid release timestamp should not be fresh")
	}
}

func TestWeightedEntityMatchCountsAndScoresMatches(t *testing.T) {
	matches, score := weightedEntityMatch(map[int]float64{1: 2.5, 3: 1.0}, []metadata.NamedEntity{
		{MalID: 1, Name: "Action"},
		{MalID: 2, Name: "Drama"},
		{MalID: 3, Name: "Sports"},
	})

	if matches != 2 || score != 3.5 {
		t.Fatalf("weightedEntityMatch = matches:%d score:%f, want 2 and 3.5", matches, score)
	}
}

func TestAddEntityWeightsSkipsInvalidIDsAndAccumulates(t *testing.T) {
	target := map[int]float64{1: 1.0}
	addEntityWeights(target, []metadata.NamedEntity{{MalID: 0}, {MalID: 1}, {MalID: 2}}, 0.5)

	if target[1] != 1.5 || target[2] != 0.5 {
		t.Fatalf("entity weights = %#v, want accumulated valid ids", target)
	}
	if _, ok := target[0]; ok {
		t.Fatalf("invalid id should not be added: %#v", target)
	}
}

func TestStrongestWeightedEntitiesSortsByWeightThenID(t *testing.T) {
	got := strongestWeightedEntities(map[int]float64{3: 1, 2: 2, 1: 2, 4: -1}, 3)
	want := []weightedEntity{{id: 1, weight: 2}, {id: 2, weight: 2}, {id: 3, weight: 1}}

	if len(got) != len(want) {
		t.Fatalf("len(got) = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
}

func TestScoreRecommendationCandidateIncludesMatchCounts(t *testing.T) {
	now := time.Date(2026, time.June, 4, 12, 0, 0, 0, time.UTC)
	profile := userTasteProfile{
		genres:       map[int]float64{1: 1, 2: 1},
		themes:       map[int]float64{10: 1},
		studios:      map[int]float64{20: 1},
		demographics: map[int]float64{30: 1},
	}

	candidate := scoreRecommendationCandidate(now, profile, metadata.Anime{
		Genres:       []metadata.NamedEntity{{MalID: 1}, {MalID: 2}},
		Themes:       []metadata.NamedEntity{{MalID: 10}},
		Studios:      []metadata.NamedEntity{{MalID: 20}},
		Demographics: []metadata.NamedEntity{{MalID: 30}},
	}, 0, 0)

	if candidate.genreMatches != 2 || candidate.themeMatches != 1 || candidate.studioMatches != 1 || candidate.demographicMatches != 1 {
		t.Fatalf("match counts = genres:%d themes:%d studios:%d demos:%d", candidate.genreMatches, candidate.themeMatches, candidate.studioMatches, candidate.demographicMatches)
	}
	if math.Abs(candidate.score) < 0.001 {
		t.Fatalf("expected non-zero score for metadata matches")
	}
}
