package anime

import (
	"context"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
	"math"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
)

const (
	forYouMaxSeeds               = 8
	forYouMaxRecommendations     = 10
	forYouCandidateFetchLimit    = 60
	forYouResultLimit            = 18
	forYouFullResultLimit        = 60
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
	forYouRecentDiversityWindow  = 3
	forYouGenreDiversityPenalty  = 1.7
	forYouThemeDiversityPenalty  = 1.2
	forYouDemoDiversityPenalty   = 1.0
	forYouStudioDiversityPenalty = 0.7
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
	score += recommendationCandidateScoreAdjustments(now, profile, candidate)

	return recommendationCandidate{
		anime:              candidate,
		score:              score,
		genreMatches:       genreMatches,
		themeMatches:       themeMatches,
		studioMatches:      studioMatches,
		demographicMatches: demographicMatches,
	}
}

func recommendationCandidateScoreAdjustments(
	now time.Time,
	profile userTasteProfile,
	candidate jikan.Anime,
) float64 {
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

	return now.Sub(airedAt) <= forYouFreshReleaseWindow
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
	remaining := slices.Clone(candidates)
	seenFeatures := newDiversityFeatureCounts()
	recentFeatures := make([]diversityFeatureSet, 0, forYouRecentDiversityWindow)

	for len(selected) < limit && len(remaining) > 0 {
		bestIndex := bestDiverseCandidateIndex(remaining, seenFeatures, recentFeatures)
		candidate := remaining[bestIndex]
		remaining = slices.Delete(remaining, bestIndex, bestIndex+1)

		if slices.ContainsFunc(selected, func(anime domain.Anime) bool {
			return anime.MalID == candidate.anime.MalID
		}) {
			continue
		}

		selected = append(selected, domain.Anime{Anime: candidate.anime})
		features := diversityFeatures(candidate.anime)
		seenFeatures.add(features)
		recentFeatures = append(recentFeatures, features)
		if len(recentFeatures) > forYouRecentDiversityWindow {
			recentFeatures = recentFeatures[1:]
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

func bestDiverseCandidateIndex(
	candidates []recommendationCandidate,
	seen diversityFeatureCounts,
	recent []diversityFeatureSet,
) int {
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

func diversityPenalty(
	features diversityFeatureSet,
	seen diversityFeatureCounts,
	recent []diversityFeatureSet,
) float64 {
	penalty := 0.0
	penalty += repeatedFeaturePenalty(features.genres, seen.genres, recentGenreCounts(recent), forYouGenreDiversityPenalty)
	penalty += repeatedFeaturePenalty(features.themes, seen.themes, recentThemeCounts(recent), forYouThemeDiversityPenalty)
	penalty += repeatedFeaturePenalty(
		features.demographics,
		seen.demographics,
		recentDemographicCounts(recent),
		forYouDemoDiversityPenalty,
	)
	penalty += repeatedFeaturePenalty(features.studios, seen.studios, recentStudioCounts(recent), forYouStudioDiversityPenalty)

	return penalty
}

func repeatedFeaturePenalty(
	features map[int]struct{},
	seen map[int]int,
	recent map[int]int,
	weight float64,
) float64 {
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

type rankedCandidate struct {
	id                 int
	collaborativeScore float64
	profileSearchScore float64
	anime              jikan.Anime
	hasAnime           bool
}

type candidateStore struct {
	watchlistAnimeIDs map[int]struct{}
	byID              map[int]rankedCandidate
	mu                sync.Mutex
}

func newCandidateStore(watchlist []db.GetUserWatchListRow) *candidateStore {
	watchlistAnimeIDs := make(map[int]struct{}, len(watchlist))
	for _, entry := range watchlist {
		if entry.AnimeID <= 0 {
			continue
		}
		watchlistAnimeIDs[int(entry.AnimeID)] = struct{}{}
	}

	return &candidateStore{
		watchlistAnimeIDs: watchlistAnimeIDs,
		byID:              map[int]rankedCandidate{},
	}
}

func (s *candidateStore) upsert(candidate rankedCandidate) {
	if candidate.id <= 0 {
		return
	}
	if _, exists := s.watchlistAnimeIDs[candidate.id]; exists {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	current, ok := s.byID[candidate.id]
	if !ok {
		s.byID[candidate.id] = candidate
		return
	}

	current.collaborativeScore += candidate.collaborativeScore
	current.profileSearchScore += candidate.profileSearchScore
	if candidate.hasAnime {
		current.anime = candidate.anime
		current.hasAnime = true
	}
	s.byID[candidate.id] = current
}

func (s *candidateStore) ranked() []rankedCandidate {
	ranked := make([]rankedCandidate, 0, len(s.byID))
	for _, item := range s.byID {
		ranked = append(ranked, item)
	}

	sort.Slice(ranked, func(i, j int) bool {
		left := rankedCandidateRetrievalScore(ranked[i].collaborativeScore, ranked[i].profileSearchScore)
		right := rankedCandidateRetrievalScore(ranked[j].collaborativeScore, ranked[j].profileSearchScore)
		if left == right {
			return ranked[i].id < ranked[j].id
		}
		return left > right
	})

	return ranked
}

func (s *animeService) GetTopPickForYou(ctx context.Context, userID string) (domain.CatalogSectionData, error) {
	return s.getTopPicksForYou(ctx, userID, forYouResultLimit)
}

func (s *animeService) GetTopPicksForYou(ctx context.Context, userID string) (domain.CatalogSectionData, error) {
	return s.getTopPicksForYou(ctx, userID, forYouFullResultLimit)
}

func (s *animeService) fetchSeedAnimes(ctx context.Context, seedPool []recommendationSeed) ([]jikan.Anime, error) {
	seedAnimes := make([]jikan.Anime, len(seedPool))
	var g errgroup.Group
	g.SetLimit(4)

	for i, seed := range seedPool {
		g.Go(func() error {
			anime, err := s.jikan.GetAnimeByID(ctx, seed.animeID)
			if err != nil {
				return err
			}
			seedAnimes[i] = anime
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	return seedAnimes, nil
}

func (s *animeService) collectCollaborativeCandidates(ctx context.Context, seedPool []recommendationSeed, store *candidateStore) error {
	var g errgroup.Group
	g.SetLimit(4)

	for _, seed := range seedPool {
		g.Go(func() error {
			recs, err := s.jikan.GetAnimeRecommendations(ctx, seed.animeID)
			if err != nil {
				return err
			}
			for i, rec := range recs {
				if i >= forYouMaxRecommendations {
					break
				}
				id := rec.Entry.MalID
				if id <= 0 || id == seed.animeID {
					continue
				}
				store.upsert(rankedCandidate{
					id:                 id,
					collaborativeScore: float64(rec.Votes) * seed.weight,
				})
			}
			return nil
		})
	}

	return g.Wait()
}

func (s *animeService) collectProfileSearchCandidates(ctx context.Context, profile userTasteProfile, store *candidateStore) error {
	queries := buildProfileSearchQueries(profile)
	var g errgroup.Group
	g.SetLimit(3)

	for _, query := range queries {
		g.Go(func() error {
			res, err := s.jikan.SearchAdvanced(
				ctx,
				"",
				"",
				"",
				"score",
				"desc",
				query.genreIDs,
				query.studioID,
				true,
				1,
				forYouProfileSearchLimit,
			)
			if err != nil {
				observability.Warn(
					"top_pick_profile_search_failed",
					"anime",
					"",
					map[string]any{
						"genres":    query.genreIDs,
						"studio_id": query.studioID,
					},
					err,
				)
				return nil
			}

			for i, anime := range res.Animes {
				if anime.MalID <= 0 {
					continue
				}
				store.upsert(rankedCandidate{
					id:                 anime.MalID,
					profileSearchScore: query.weight * profileSearchRankWeight(i),
					anime:              anime,
					hasAnime:           true,
				})
			}
			return nil
		})
	}

	return g.Wait()
}

func (s *animeService) scoreRankedCandidates(
	ctx context.Context,
	now time.Time,
	profile userTasteProfile,
	ranked []rankedCandidate,
) ([]recommendationCandidate, error) {
	limit := min(len(ranked), forYouCandidateFetchLimit)
	candidates := make([]recommendationCandidate, 0, limit)
	var candidatesMu sync.Mutex
	var g errgroup.Group
	g.SetLimit(6)

	for i := 0; i < limit; i++ {
		item := ranked[i]
		g.Go(func() error {
			anime := item.anime
			if !item.hasAnime || !hasTasteMetadata(anime) {
				fetchedAnime, err := s.jikan.GetAnimeByID(ctx, item.id)
				if err != nil {
					observability.Warn(
						"recommendation_anime_fetch_failed",
						"anime",
						"",
						map[string]any{"anime_id": item.id},
						err,
					)
					return nil
				}
				anime = fetchedAnime
			}

			candidate := scoreRecommendationCandidate(
				now,
				profile,
				anime,
				item.collaborativeScore,
				item.profileSearchScore,
			)
			candidatesMu.Lock()
			candidates = append(candidates, candidate)
			candidatesMu.Unlock()
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].score == candidates[j].score {
			return candidates[i].anime.MalID < candidates[j].anime.MalID
		}
		return candidates[i].score > candidates[j].score
	})

	return candidates, nil
}

func (s *animeService) getTopPicksForYou(
	ctx context.Context,
	userID string,
	resultLimit int,
) (domain.CatalogSectionData, error) {
	if strings.TrimSpace(userID) == "" {
		return domain.CatalogSectionData{Animes: []domain.Anime{}}, nil
	}

	watchlist, err := s.repo.GetUserWatchList(ctx, userID)
	if err != nil {
		return domain.CatalogSectionData{}, err
	}

	now := time.Now()
	seedPool := buildRecommendationSeeds(now, watchlist)
	if len(seedPool) == 0 {
		return domain.CatalogSectionData{Animes: []domain.Anime{}}, nil
	}

	seedAnimes, err := s.fetchSeedAnimes(ctx, seedPool)
	if err != nil {
		return domain.CatalogSectionData{}, err
	}

	profile := buildTasteProfile(now, seedPool, seedAnimes)
	store := newCandidateStore(watchlist)

	if err := s.collectCollaborativeCandidates(ctx, seedPool, store); err != nil {
		return domain.CatalogSectionData{}, err
	}
	if err := s.collectProfileSearchCandidates(ctx, profile, store); err != nil {
		return domain.CatalogSectionData{}, err
	}

	ranked := store.ranked()
	if len(ranked) == 0 {
		return domain.CatalogSectionData{Animes: []domain.Anime{}}, nil
	}

	candidates, err := s.scoreRankedCandidates(ctx, now, profile, ranked)
	if err != nil {
		return domain.CatalogSectionData{}, err
	}

	return domain.CatalogSectionData{
		Animes: rerankRecommendationCandidates(candidates, resultLimit),
	}, nil
}
