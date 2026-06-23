package recommendations

import (
	"mal/integrations/jikan"
	"mal/internal/domain"
	"math"
	"slices"
)

func rerankRecommendationCandidates(candidates []recommendationCandidate, limit int) []domain.Anime {
	selected := make([]domain.Anime, 0, min(limit, len(candidates)))
	remaining := slices.Clone(candidates)
	seen := newDiversityFeatureCounts()
	recent := make([]diversityFeatureSet, 0, recentDiversityWindow)

	for len(selected) < limit && len(remaining) > 0 {
		bestIndex := bestDiverseCandidateIndex(remaining, seen, recent)
		candidate := remaining[bestIndex]
		remaining = slices.Delete(remaining, bestIndex, bestIndex+1)

		if slices.ContainsFunc(selected, func(anime domain.Anime) bool {
			return anime.MalID == candidate.anime.MalID
		}) {
			continue
		}

		selected = append(selected, domain.Anime{Anime: candidate.anime})
		features := diversityFeatures(candidate.anime)
		seen.add(features)
		recent = append(recent, features)
		if len(recent) > recentDiversityWindow {
			recent = recent[1:]
		}
	}

	return selected
}

type diversityFeatureSet struct {
	genres       map[int]struct{}
	themes       map[int]struct{}
	demographics map[int]struct{}
	studios      map[int]struct{}
}

type diversityFeatureCounts struct {
	genres       map[int]int
	themes       map[int]int
	demographics map[int]int
	studios      map[int]int
}

func newDiversityFeatureCounts() diversityFeatureCounts {
	return diversityFeatureCounts{
		genres:       make(map[int]int),
		themes:       make(map[int]int),
		demographics: make(map[int]int),
		studios:      make(map[int]int),
	}
}

func (counts diversityFeatureCounts) add(features diversityFeatureSet) {
	addDiversityCounts(counts.genres, features.genres)
	addDiversityCounts(counts.themes, features.themes)
	addDiversityCounts(counts.demographics, features.demographics)
	addDiversityCounts(counts.studios, features.studios)
}

func addDiversityCounts(target map[int]int, features map[int]struct{}) {
	for id := range features {
		target[id]++
	}
}

func bestDiverseCandidateIndex(candidates []recommendationCandidate, seen diversityFeatureCounts, recent []diversityFeatureSet) int {
	bestIndex := 0
	bestScore := math.Inf(-1)

	for i, candidate := range candidates {
		score := candidate.score - diversityPenalty(diversityFeatures(candidate.anime), seen, recent)
		if score == bestScore {
			if candidate.score <= candidates[bestIndex].score {
				continue
			}
		}
		if score > bestScore {
			bestScore = score
			bestIndex = i
		}
	}

	return bestIndex
}

func diversityFeatures(anime jikan.Anime) diversityFeatureSet {
	return diversityFeatureSet{
		genres:       entityIDSet(anime.Genres),
		themes:       entityIDSet(anime.Themes),
		demographics: entityIDSet(anime.Demographics),
		studios:      entityIDSet(anime.Studios),
	}
}

func entityIDSet(entities []jikan.NamedEntity) map[int]struct{} {
	ids := make(map[int]struct{}, len(entities))
	for _, entity := range entities {
		if entity.MalID <= 0 {
			continue
		}
		ids[entity.MalID] = struct{}{}
	}
	return ids
}

func diversityPenalty(features diversityFeatureSet, seen diversityFeatureCounts, recent []diversityFeatureSet) float64 {
	penalty := 0.0
	penalty += repeatedFeaturePenalty(features.genres, seen.genres, recentGenreCounts(recent), genreDiversityPenalty)
	penalty += repeatedFeaturePenalty(features.themes, seen.themes, recentThemeCounts(recent), themeDiversityPenalty)
	penalty += repeatedFeaturePenalty(features.demographics, seen.demographics, recentDemographicCounts(recent), demoDiversityPenalty)
	penalty += repeatedFeaturePenalty(features.studios, seen.studios, recentStudioCounts(recent), studioDiversityPenalty)

	return penalty
}

func repeatedFeaturePenalty(features map[int]struct{}, seen map[int]int, recent map[int]int, weight float64) float64 {
	total := 0.0
	for id := range features {
		total += float64(seen[id]) * weight * 0.35
		total += float64(recent[id]) * weight
	}
	return total
}

func recentGenreCounts(recent []diversityFeatureSet) map[int]int {
	return recentFeatureCounts(recent, func(features diversityFeatureSet) map[int]struct{} {
		return features.genres
	})
}

func recentThemeCounts(recent []diversityFeatureSet) map[int]int {
	return recentFeatureCounts(recent, func(features diversityFeatureSet) map[int]struct{} {
		return features.themes
	})
}

func recentDemographicCounts(recent []diversityFeatureSet) map[int]int {
	return recentFeatureCounts(recent, func(features diversityFeatureSet) map[int]struct{} {
		return features.demographics
	})
}

func recentStudioCounts(recent []diversityFeatureSet) map[int]int {
	return recentFeatureCounts(recent, func(features diversityFeatureSet) map[int]struct{} {
		return features.studios
	})
}

func recentFeatureCounts(
	recent []diversityFeatureSet,
	selectFeatures func(diversityFeatureSet) map[int]struct{},
) map[int]int {
	counts := make(map[int]int)
	for _, features := range recent {
		addDiversityCounts(counts, selectFeatures(features))
	}
	return counts
}
