package recommendations

import (
	"mal/integrations/jikan"
	"math"
	"time"
)

func profileSearchRankWeight(rank int) float64 {
	return math.Max(0.35, 1-(float64(rank)*0.08))
}

func rankedCandidateRetrievalScore(collaborativeScore float64, profileSearchScore float64) float64 {
	return (math.Log1p(collaborativeScore) * collaborativeWeight) +
		(profileSearchScore * profileSearchWeight)
}

func hasTasteMetadata(anime jikan.Anime) bool {
	return len(anime.Genres) > 0 ||
		len(anime.Themes) > 0 ||
		len(anime.Studios) > 0 ||
		len(anime.Demographics) > 0
}

func scoreRecommendationCandidate(
	now time.Time,
	profile userTasteProfile,
	candidate jikan.Anime,
	collaborativeScore float64,
	profileSearchScore float64,
) recommendationCandidate {
	genres, genreScore := weightedEntityMatch(profile.genres, candidate.Genres)
	themes, themeScore := weightedEntityMatch(profile.themes, candidate.Themes)
	studios, studioScore := weightedEntityMatch(profile.studios, candidate.Studios)
	demos, demoScore := weightedEntityMatch(profile.demographics, candidate.Demographics)

	score := rankedCandidateRetrievalScore(collaborativeScore, profileSearchScore)
	score += genreScore * genreMatchWeight
	score += themeScore * themeMatchWeight
	score += studioScore * studioMatchWeight
	score += demoScore * demographicMatchWeight
	score += recommendationCandidateScoreAdjustments(now, profile, candidate)

	return recommendationCandidate{
		anime:              candidate,
		score:              score,
		genreMatches:       genres,
		themeMatches:       themes,
		studioMatches:      studios,
		demographicMatches: demos,
	}
}

func recommendationCandidateScoreAdjustments(now time.Time, profile userTasteProfile, candidate jikan.Anime) float64 {
	var score float64

	if candidate.Score > 0 {
		score += min(candidate.Score/10.0, 1.0)
	}
	if candidate.Popularity > 0 {
		score += 1.0 / math.Log(float64(candidate.Popularity)+8)
	}
	if profile.prefersAiring && candidate.Airing {
		score += 0.5
	}
	if profile.prefersRecent && isRecentCandidate(now, candidate.Year) {
		score += 0.45
	}
	if isClassicCandidate(now, candidate.Year) {
		score -= 0.2
	}
	if candidate.Status == "Not yet aired" {
		score -= 0.35
	}
	if isFreshRelease(now, candidate.Aired.From) {
		score += 0.3
	}

	return score
}

func isRecentCandidate(now time.Time, year int) bool {
	return year > 0 && now.Year()-year <= 4
}

func isClassicCandidate(now time.Time, year int) bool {
	return year > 0 && now.Year()-year > 15
}

func isFreshRelease(now time.Time, airedFrom string) bool {
	if airedFrom == "" {
		return false
	}

	airedAt, err := time.Parse(time.RFC3339, airedFrom)
	if err != nil {
		return false
	}

	return now.Sub(airedAt) <= freshReleaseWindow
}

func weightedEntityMatch(weights map[int]float64, entities []jikan.NamedEntity) (int, float64) {
	var matches int
	var score float64

	for _, entity := range entities {
		weight, ok := weights[entity.MalID]
		if !ok {
			continue
		}
		matches++
		score += weight
	}

	return matches, score
}
