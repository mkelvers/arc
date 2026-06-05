package anime

import (
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"math"
	"slices"
	"sort"
	"strings"
	"time"
)

const (
	forYouMaxSeeds               = 8
	forYouMaxRecommendations     = 10
	forYouCandidateFetchLimit    = 60
	forYouResultLimit            = 18
	forYouProfileSearchLimit     = 8
	forYouProfileGenreSearches   = 2
	forYouProfileThemeSearches   = 2
	forYouCollaborativeWeight    = 1.4
	forYouProfileSearchWeight    = 0.8
	forYouSeedRecencyWindow      = 180 * 24 * time.Hour
	forYouFreshReleaseWindow     = 540 * 24 * time.Hour
	forYouGenreMatchWeight       = 1.8
	forYouThemeMatchWeight       = 1.0
	forYouStudioMatchWeight      = 0.7
	forYouDemographicMatchWeight = 0.9
)

type recommendationSeed struct {
	animeID int
	weight  float64
}

type weightedEntity struct {
	id     int
	weight float64
}

type profileSearchQuery struct {
	genreIDs []int
	studioID int
	weight   float64
}

type recommendationCandidate struct {
	anime              jikan.Anime
	score              float64
	genreMatches       int
	themeMatches       int
	studioMatches      int
	demographicMatches int
}

type userTasteProfile struct {
	genres        map[int]float64
	themes        map[int]float64
	studios       map[int]float64
	demographics  map[int]float64
	prefersAiring bool
	prefersRecent bool
}

func buildRecommendationSeeds(
	now time.Time,
	watchlist []db.GetUserWatchListRow,
) []recommendationSeed {
	seeds := make([]recommendationSeed, 0, min(len(watchlist), forYouMaxSeeds))

	for _, entry := range watchlist {
		weight := recommendationEntryWeight(now, entry)
		if weight <= 0 || entry.AnimeID <= 0 {
			continue
		}

		seeds = append(seeds, recommendationSeed{
			animeID: int(entry.AnimeID),
			weight:  weight,
		})
		if len(seeds) >= forYouMaxSeeds {
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
			recencyWeight = math.Max(0.35, 1-(age.Hours()/forYouSeedRecencyWindow.Hours()))
		}
	}

	progressWeight := 0.6
	if entry.CurrentEpisode.Valid && entry.CurrentEpisode.Int64 > 0 {
		progressWeight = min(1.0, 0.6+(0.08*float64(entry.CurrentEpisode.Int64)))
	}

	return statusWeight * recencyWeight * progressWeight
}

func buildTasteProfile(
	now time.Time,
	seeds []recommendationSeed,
	seedAnimes []jikan.Anime,
) userTasteProfile {
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

	for _, entity := range strongestWeightedEntities(profile.genres, forYouProfileGenreSearches) {
		queries = append(queries, profileSearchQuery{
			genreIDs: []int{entity.id},
			weight:   entity.weight,
		})
	}

	for _, entity := range strongestWeightedEntities(profile.themes, forYouProfileThemeSearches) {
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

func profileSearchRankWeight(rank int) float64 {
	return math.Max(0.35, 1-(float64(rank)*0.08))
}

func rankedCandidateRetrievalScore(collaborativeScore float64, profileSearchScore float64) float64 {
	return (math.Log1p(collaborativeScore) * forYouCollaborativeWeight) +
		(profileSearchScore * forYouProfileSearchWeight)
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
	genreMatches, genreScore := weightedEntityMatch(profile.genres, candidate.Genres)
	themeMatches, themeScore := weightedEntityMatch(profile.themes, candidate.Themes)
	studioMatches, studioScore := weightedEntityMatch(profile.studios, candidate.Studios)
	demographicMatches, demographicScore := weightedEntityMatch(profile.demographics, candidate.Demographics)

	score := rankedCandidateRetrievalScore(collaborativeScore, profileSearchScore)
	score += genreScore * forYouGenreMatchWeight
	score += themeScore * forYouThemeMatchWeight
	score += studioScore * forYouStudioMatchWeight
	score += demographicScore * forYouDemographicMatchWeight

	if candidate.Score > 0 {
		score += min(candidate.Score/10.0, 1.0)
	}
	if candidate.Popularity > 0 {
		score += 1.0 / math.Log(float64(candidate.Popularity)+8)
	}
	if profile.prefersAiring && candidate.Airing {
		score += 0.5
	}
	if profile.prefersRecent && candidate.Year > 0 && now.Year()-candidate.Year <= 4 {
		score += 0.45
	}
	if candidate.Year > 0 && now.Year()-candidate.Year > 15 {
		score -= 0.2
	}
	if candidate.Status == "Not yet aired" {
		score -= 0.35
	}
	if candidate.Aired.From != "" {
		if airedAt, err := time.Parse(time.RFC3339, candidate.Aired.From); err == nil {
			if now.Sub(airedAt) <= forYouFreshReleaseWindow {
				score += 0.3
			}
		}
	}

	return recommendationCandidate{
		anime:              candidate,
		score:              score,
		genreMatches:       genreMatches,
		themeMatches:       themeMatches,
		studioMatches:      studioMatches,
		demographicMatches: demographicMatches,
	}
}

func weightedEntityMatch(weights map[int]float64, entities []jikan.NamedEntity) (int, float64) {
	var (
		matches int
		score   float64
	)

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

func rerankRecommendationCandidates(candidates []recommendationCandidate, limit int) []domain.Anime {
	selected := make([]domain.Anime, 0, min(limit, len(candidates)))
	seenGenres := make(map[int]int)

	for _, candidate := range candidates {
		if len(selected) >= limit {
			break
		}

		if isGenreOverrepresented(candidate.anime, seenGenres) {
			continue
		}

		selected = append(selected, domain.Anime{Anime: candidate.anime})
		for _, genre := range candidate.anime.Genres {
			seenGenres[genre.MalID]++
		}
	}

	if len(selected) >= limit {
		return selected
	}

	for _, candidate := range candidates {
		if len(selected) >= limit {
			break
		}
		if slices.ContainsFunc(selected, func(anime domain.Anime) bool {
			return anime.MalID == candidate.anime.MalID
		}) {
			continue
		}
		selected = append(selected, domain.Anime{Anime: candidate.anime})
	}

	return selected
}

func isGenreOverrepresented(anime jikan.Anime, seenGenres map[int]int) bool {
	if len(anime.Genres) == 0 {
		return false
	}

	matchedGenres := 0
	for _, genre := range anime.Genres {
		if seenGenres[genre.MalID] >= 3 {
			matchedGenres++
		}
	}

	return matchedGenres == len(anime.Genres)
}
