package recommendations

import (
	"mal/integrations/metadata"
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

func scoreRecommendationCandidate(
	now time.Time,
	profile userTasteProfile,
	candidate metadata.Anime,
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
		rationale:          buildRecommendationRationale(profile, candidate),
	}
}

func buildRecommendationRationale(profile userTasteProfile, candidate metadata.Anime) []string {
	rationale := make([]string, 0, 4)
	rationale = append(rationale, matchedEntityNames(profile.genres, candidate.Genres)...)
	rationale = append(rationale, matchedEntityNames(profile.themes, candidate.Themes)...)
	rationale = append(rationale, matchedEntityNames(profile.studios, candidate.Studios)...)
	rationale = append(rationale, matchedEntityNames(profile.demographics, candidate.Demographics)...)

	if len(rationale) > 4 {
		return rationale[:4]
	}
	return rationale
}

func recommendationCandidateScoreAdjustments(now time.Time, profile userTasteProfile, candidate metadata.Anime) float64 {
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

func weightedEntityMatch(weights map[int]float64, entities []metadata.NamedEntity) (int, float64) {
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

func matchedEntityNames(weights map[int]float64, entities []metadata.NamedEntity) []string {
	if len(weights) == 0 {
		return []string{}
	}

	names := make([]string, 0, 1)
	for _, entity := range entities {
		if entity.Name == "" || weights[entity.MalID] <= 0 {
			continue
		}
		names = append(names, entity.Name)
		if len(names) >= 1 {
			break
		}
	}

	return names
}
