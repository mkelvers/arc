package recommendations

import (
	"context"
	"fmt"
	"mal/integrations/jikan"
	"mal/internal/domain"
	"mal/internal/observability"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
)

type engine struct {
	jikan *jikan.Client
	repo  domain.AnimeRepository
}

func GetTopPicksForYou(
	ctx context.Context,
	jikanClient *jikan.Client,
	repo domain.AnimeRepository,
	userID string,
	resultLimit int,
) (domain.CatalogSectionData, error) {
	return engine{jikan: jikanClient, repo: repo}.getTopPicksForYou(ctx, userID, resultLimit)
}

func (e engine) getTopPicksForYou(ctx context.Context, userID string, resultLimit int) (domain.CatalogSectionData, error) {
	if strings.TrimSpace(userID) == "" {
		return domain.CatalogSectionData{Animes: []domain.Anime{}}, nil
	}

	watchlist, err := e.repo.GetUserWatchList(ctx, userID)
	if err != nil {
		return domain.CatalogSectionData{}, fmt.Errorf("get user watchlist for %q: %w", userID, err)
	}

	now := time.Now()
	seedPool := buildRecommendationSeeds(now, watchlist)
	if len(seedPool) == 0 {
		return domain.CatalogSectionData{Animes: []domain.Anime{}}, nil
	}

	seedAnimes, err := e.fetchSeedAnimes(ctx, seedPool)
	if err != nil {
		return domain.CatalogSectionData{}, fmt.Errorf("fetch seed animes: %w", err)
	}

	profile := buildTasteProfile(now, seedPool, seedAnimes)
	store := newCandidateStore(watchlist)

	if err := e.collectCollaborativeCandidates(ctx, seedPool, store); err != nil {
		return domain.CatalogSectionData{}, fmt.Errorf("collect collaborative candidates: %w", err)
	}
	if err := e.collectProfileSearchCandidates(ctx, profile, store); err != nil {
		return domain.CatalogSectionData{}, fmt.Errorf("collect profile search candidates: %w", err)
	}

	ranked := store.ranked()
	if len(ranked) == 0 {
		return domain.CatalogSectionData{Animes: []domain.Anime{}}, nil
	}

	candidates, err := e.scoreRankedCandidates(ctx, now, profile, ranked, resultLimit)
	if err != nil {
		return domain.CatalogSectionData{}, fmt.Errorf("score ranked candidates: %w", err)
	}

	return domain.CatalogSectionData{
		Animes: rerankRecommendationCandidates(candidates, resultLimit),
	}, nil
}

func (e engine) fetchSeedAnimes(ctx context.Context, seedPool []recommendationSeed) ([]jikan.Anime, error) {
	seedAnimes := make([]jikan.Anime, len(seedPool))
	var g errgroup.Group
	g.SetLimit(4)

	for i, seed := range seedPool {
		g.Go(func() error {
			anime, err := e.jikan.GetAnimeByID(ctx, seed.animeID)
			if err != nil {
				return fmt.Errorf("get seed anime %d: %w", seed.animeID, err)
			}
			seedAnimes[i] = anime
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, fmt.Errorf("wait for seed anime fetches: %w", err)
	}

	return seedAnimes, nil
}

func (e engine) collectCollaborativeCandidates(ctx context.Context, seedPool []recommendationSeed, store *candidateStore) error {
	var g errgroup.Group
	g.SetLimit(4)

	for _, seed := range seedPool {
		g.Go(func() error {
			recs, err := e.jikan.GetAnimeRecommendations(ctx, seed.animeID)
			if err != nil {
				observability.Warn(
					"collaborative_recommendations_failed",
					"anime",
					"",
					map[string]any{"seed_id": seed.animeID},
					err,
				)
				return nil
			}
			for i, rec := range recs {
				if i >= maxRecommendations {
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

	if err := g.Wait(); err != nil {
		return fmt.Errorf("wait for collaborative candidate fetches: %w", err)
	}
	return nil
}

func (e engine) collectProfileSearchCandidates(ctx context.Context, profile userTasteProfile, store *candidateStore) error {
	queries := buildProfileSearchQueries(profile)
	var g errgroup.Group
	g.SetLimit(3)

	for _, query := range queries {
		g.Go(func() error {
			res, err := e.jikan.SearchAdvanced(
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
				profileSearchLimit,
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

	if err := g.Wait(); err != nil {
		return fmt.Errorf("wait for profile search candidate fetches: %w", err)
	}
	return nil
}

func (e engine) scoreRankedCandidates(
	ctx context.Context,
	now time.Time,
	profile userTasteProfile,
	ranked []rankedCandidate,
	resultLimit int,
) ([]recommendationCandidate, error) {
	limit := min(len(ranked), candidateScoreLimit(resultLimit))
	candidates := make([]recommendationCandidate, 0, limit)
	var candidatesMu sync.Mutex
	var g errgroup.Group
	g.SetLimit(6)

	for i := 0; i < limit; i++ {
		item := ranked[i]
		g.Go(func() error {
			anime := item.anime
			if !item.hasAnime || !hasTasteMetadata(anime) {
				fetchedAnime, err := e.jikan.GetAnimeByID(ctx, item.id)
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
		return nil, fmt.Errorf("wait for candidate scoring: %w", err)
	}

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].score == candidates[j].score {
			return candidates[i].anime.MalID < candidates[j].anime.MalID
		}
		return candidates[i].score > candidates[j].score
	})

	return candidates, nil
}

func candidateScoreLimit(resultLimit int) int {
	if resultLimit <= 0 {
		return 0
	}

	return min(candidateFetchLimit, resultLimit+candidateFetchBuffer)
}
