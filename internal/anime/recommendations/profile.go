package recommendations

import (
	"mal/integrations/jikan"
	"mal/internal/database/db"
	"math"
	"sort"
	"strings"
	"time"
)

func buildRecommendationSeeds(now time.Time, watchlist []db.GetUserWatchListRow) []recommendationSeed {
	seeds := make([]recommendationSeed, 0, min(len(watchlist), maxSeeds))

	for _, entry := range watchlist {
		weight := recommendationEntryWeight(now, entry)
		if weight <= 0 || entry.AnimeID <= 0 {
			continue
		}

		seeds = append(seeds, recommendationSeed{
			animeID: int(entry.AnimeID),
			weight:  weight,
		})
		if len(seeds) >= maxSeeds {
			break
		}
	}

	return seeds
}

func recommendationEntryWeight(now time.Time, entry db.GetUserWatchListRow) float64 {
	status := strings.TrimSpace(entry.Status)

	var statusWeight float64
	switch status {
	case "completed":
		statusWeight = 1.0
	case "watching":
		statusWeight = 0.9
	case "plan_to_watch":
		statusWeight = 0.35
	default:
		return 0
	}

	recencyWeight := 1.0
	if !entry.UpdatedAt.IsZero() {
		age := now.Sub(entry.UpdatedAt)
		if age > 0 {
			recencyWeight = math.Max(0.35, 1-(age.Hours()/seedRecencyWindow.Hours()))
		}
	}

	progressWeight := 0.6
	if entry.CurrentEpisode.Valid && entry.CurrentEpisode.Int64 > 0 {
		progressWeight = min(1.0, 0.6+(0.08*float64(entry.CurrentEpisode.Int64)))
	}

	return statusWeight * recencyWeight * progressWeight
}

func buildTasteProfile(now time.Time, seeds []recommendationSeed, seedAnimes []jikan.Anime) userTasteProfile {
	profile := userTasteProfile{
		genres:       make(map[int]float64),
		themes:       make(map[int]float64),
		studios:      make(map[int]float64),
		demographics: make(map[int]float64),
	}

	var totalWeight float64
	var airingWeight float64
	var recentWeight float64

	for i, anime := range seedAnimes {
		seedWeight := 1.0
		if i < len(seeds) && seeds[i].weight > 0 {
			seedWeight = seeds[i].weight
		}

		addEntityWeights(profile.genres, anime.Genres, seedWeight)
		addEntityWeights(profile.themes, anime.Themes, seedWeight*0.7)
		addEntityWeights(profile.studios, anime.Studios, seedWeight*0.5)
		addEntityWeights(profile.demographics, anime.Demographics, seedWeight*0.7)

		if anime.Airing {
			airingWeight += seedWeight
		}
		if anime.Year > 0 && now.Year()-anime.Year <= 4 {
			recentWeight += seedWeight
		}
		totalWeight += seedWeight
	}

	if totalWeight > 0 {
		profile.prefersAiring = airingWeight/totalWeight >= 0.5
		profile.prefersRecent = recentWeight/totalWeight >= 0.5
	}

	return profile
}

func addEntityWeights(target map[int]float64, entities []jikan.NamedEntity, weight float64) {
	for _, entity := range entities {
		if entity.MalID <= 0 {
			continue
		}
		target[entity.MalID] += weight
	}
}

func buildProfileSearchQueries(profile userTasteProfile) []profileSearchQuery {
	queries := make([]profileSearchQuery, 0, 6)

	for _, entity := range strongestWeightedEntities(profile.genres, profileGenreSearches) {
		queries = append(queries, profileSearchQuery{
			genreIDs: []int{entity.id},
			weight:   entity.weight,
		})
	}

	for _, entity := range strongestWeightedEntities(profile.themes, profileThemeSearches) {
		queries = append(queries, profileSearchQuery{
			genreIDs: []int{entity.id},
			weight:   entity.weight * 0.8,
		})
	}

	for _, entity := range strongestWeightedEntities(profile.demographics, 1) {
		queries = append(queries, profileSearchQuery{
			genreIDs: []int{entity.id},
			weight:   entity.weight * 0.8,
		})
	}

	for _, entity := range strongestWeightedEntities(profile.studios, 1) {
		queries = append(queries, profileSearchQuery{
			studioID: entity.id,
			weight:   entity.weight * 0.7,
		})
	}

	return queries
}

func strongestWeightedEntities(weights map[int]float64, limit int) []weightedEntity {
	if limit <= 0 || len(weights) == 0 {
		return []weightedEntity{}
	}

	items := make([]weightedEntity, 0, len(weights))
	for id, weight := range weights {
		if id <= 0 || weight <= 0 {
			continue
		}
		items = append(items, weightedEntity{id: id, weight: weight})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].weight == items[j].weight {
			return items[i].id < items[j].id
		}
		return items[i].weight > items[j].weight
	})

	if len(items) > limit {
		return items[:limit]
	}
	return items
}
