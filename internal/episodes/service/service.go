// Package service provides episode availability checking logic.
package service

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"mal/integrations/anilist"
	"mal/internal/database/db"
	"mal/internal/domain"

	"go.uber.org/fx"
	"golang.org/x/sync/singleflight"
)

type Clock interface {
	Now() time.Time
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

const canonicalEpisodeRefreshTimeout = 45 * time.Second

type canonicalRefreshPolicy string

const (
	canonicalRefreshRegular canonicalRefreshPolicy = "regular"
	canonicalRefreshForced  canonicalRefreshPolicy = "forced"
)

type EpisodeService struct {
	queries          *db.Queries
	metadata         *anilist.CachedClient
	providers        []domain.EpisodeAvailabilityProvider
	clock            Clock
	enabled          bool
	canonicalRefresh singleflight.Group
	cache            domain.CacheStore
}

type EpisodeServiceParams struct {
	fx.In

	Queries   *db.Queries
	Metadata  *anilist.CachedClient
	Providers []domain.EpisodeAvailabilityProvider
	Enabled   bool
	Cache     domain.CacheStore
}

func NewEpisodeServiceWithAniList(params EpisodeServiceParams) domain.EpisodeService {
	return &EpisodeService{queries: params.Queries, metadata: params.Metadata, providers: params.Providers, clock: realClock{}, enabled: params.Enabled, cache: params.Cache}
}

func (s *EpisodeService) GetCanonicalEpisodes(ctx context.Context, anime domain.Anime, forceRefresh bool) (domain.CanonicalEpisodeList, error) {
	if anime.MalID <= 0 {
		return domain.CanonicalEpisodeList{}, fmt.Errorf("canonical episodes: invalid anime id %d", anime.MalID)
	}

	if !forceRefresh {
		if cached, ok := s.getFreshCached(ctx, anime); ok {
			return cloneCanonicalEpisodeList(cached), nil
		}
	}

	return s.waitForCanonicalRefresh(ctx, anime, canonicalRefreshPolicyFor(forceRefresh))
}

func (s *EpisodeService) GetCachedCanonicalEpisodes(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, bool) {
	if anime.MalID <= 0 {
		return domain.CanonicalEpisodeList{}, false
	}
	cached, ok := s.getDecodedCached(ctx, anime)
	if !ok {
		return domain.CanonicalEpisodeList{}, false
	}
	return cloneCanonicalEpisodeList(cached), true
}

func canonicalRefreshPolicyFor(forceRefresh bool) canonicalRefreshPolicy {
	if forceRefresh {
		return canonicalRefreshForced
	}
	return canonicalRefreshRegular
}

func (p canonicalRefreshPolicy) key(animeID int) string {
	return strconv.Itoa(animeID) + "|" + string(p)
}

func (s *EpisodeService) waitForCanonicalRefresh(ctx context.Context, anime domain.Anime, policy canonicalRefreshPolicy) (domain.CanonicalEpisodeList, error) {
	if err := ctx.Err(); err != nil {
		return domain.CanonicalEpisodeList{}, err
	}

	startedAt := time.Now()
	resultCh := s.canonicalRefresh.DoChan(policy.key(anime.MalID), func() (any, error) {
		return s.runCanonicalRefresh(ctx, anime, policy)
	})

	select {
	case <-ctx.Done():
		slog.Warn("episodes_refresh_wait_cancelled", "component", "episodes", "fields", map[string]any{
			"anime_id":    anime.MalID,
			"policy":      string(policy),
			"duration_ms": time.Since(startedAt).Milliseconds(),
		}, "error", ctx.Err())

		return domain.CanonicalEpisodeList{}, ctx.Err()
	case result := <-resultCh:
		if result.Shared {
			slog.Info("episodes_refresh_shared", "component", "episodes", "fields", map[string]any{
				"anime_id":    anime.MalID,
				"policy":      string(policy),
				"duration_ms": time.Since(startedAt).Milliseconds(),
			})
		}
		if result.Err != nil {
			return domain.CanonicalEpisodeList{}, result.Err
		}
		payload, ok := result.Val.(domain.CanonicalEpisodeList)
		if !ok {
			return domain.CanonicalEpisodeList{}, fmt.Errorf("canonical episode refresh returned %T", result.Val)
		}
		return cloneCanonicalEpisodeList(payload), nil
	}
}

func (s *EpisodeService) runCanonicalRefresh(ctx context.Context, anime domain.Anime, policy canonicalRefreshPolicy) (domain.CanonicalEpisodeList, error) {
	refreshCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), canonicalEpisodeRefreshTimeout)
	defer cancel()

	if policy == canonicalRefreshRegular {
		if cached, ok := s.getFreshCached(refreshCtx, anime); ok {
			slog.Info("episodes_refresh_cache_hit_after_join", "component", "episodes", "fields", map[string]any{
				"anime_id": anime.MalID,
				"policy":   string(policy),
			})

			return cloneCanonicalEpisodeList(cached), nil
		}
	}
	return s.refresh(refreshCtx, anime)
}

func (s *EpisodeService) RefreshTrackedDue(ctx context.Context, limit int) error {
	if !s.enabled {
		return nil
	}
	ids, err := s.trackedAnimeIDsDueForRefresh(ctx, limit)
	if err != nil {
		return fmt.Errorf("get due tracked anime: %w", err)
	}

	for i, id := range ids {
		if ctx.Err() != nil {
			slog.Warn("episodes_worker_tick_interrupted", "component", "episodes", "fields", map[string]any{
				"anime_id":  id,
				"remaining": len(ids) - i,
			}, "error", ctx.Err())

			break
		}
		if s.hasFreshTrackedEpisodeCache(ctx, id) {
			continue
		}
		anime, err := s.fetchTrackedAnime(ctx, id)
		if err != nil {
			slog.Warn("episodes_refresh_fetch_anime_failed", "component", "episodes", "fields", map[string]any{
				"anime_id": id,
			}, "error", err)

			continue
		}
		if _, err := s.refresh(ctx, anime); err != nil {
			slog.Warn("episodes_refresh_failed", "component", "episodes", "fields", map[string]any{
				"anime_id": id,
			}, "error", err)
		}
	}

	return nil
}

func (s *EpisodeService) trackedAnimeIDsDueForRefresh(ctx context.Context, limit int) ([]int64, error) {
	if limit <= 0 {
		limit = 25
	}
	return s.queries.GetTrackedAiringAnimeIDs(ctx, int32(limit))
}

func (s *EpisodeService) hasFreshTrackedEpisodeCache(ctx context.Context, id int64) bool {
	if s.cache == nil {
		return false
	}
	row, state, ok := s.getEpisodeCache(ctx, id)
	if !ok || state != domain.CacheFresh {
		return false
	}
	anime := domain.Anime{MalID: int(id), Airing: true}
	return s.isFreshEpisodeCache(anime, row, s.clock.Now())
}

func (s *EpisodeService) fetchTrackedAnime(ctx context.Context, id int64) (domain.Anime, error) {
	if s.metadata == nil {
		return domain.Anime{}, fmt.Errorf("metadata provider is not configured")
	}
	item, err := s.metadata.GetAnimeByMALID(ctx, int(id))
	if err != nil {
		return domain.Anime{}, err
	}
	return anilist.ToMetadataAnime(item), nil
}

func (s *EpisodeService) refresh(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, error) {
	now := s.clock.Now()
	slog.Info("episodes_refresh_start", "component", "episodes", "fields", map[string]any{
		"anime_id": anime.MalID,
		"title":    anime.DisplayTitle(),
		"airing":   anime.Airing,
	})

	availability, source, providerErr := s.fetchProviderAvailability(ctx, anime)
	if providerErr != nil {
		s.markFailure(ctx, anime, providerErr)
		if cached, ok := s.getDecodedCached(ctx, anime); ok {
			slog.Warn("episodes_provider_failed_serving_stale_cache", "component", "episodes", "fields", map[string]any{
				"anime_id": anime.MalID,
			}, "error", providerErr)

			return cached, nil
		}
		return domain.CanonicalEpisodeList{}, providerErr
	}

	return s.store(ctx, anime, availability, source, now)
}

func (s *EpisodeService) fetchProviderAvailability(ctx context.Context, anime domain.Anime) (domain.EpisodeAvailability, string, error) {
	titles := titleCandidates(anime)
	for _, provider := range s.providers {
		providerID, err := s.providerID(ctx, anime, provider, titles)
		if err != nil {
			slog.Warn("episodes_provider_id_miss", "component", "episodes", "fields", map[string]any{
				"anime_id": anime.MalID,
				"provider": provider.Name(),
			}, "error", err)

			continue
		}

		available, err := provider.GetEpisodeAvailabilityByProviderID(ctx, providerID)
		if err != nil {
			slog.Warn("episodes_provider_availability_miss", "component", "episodes", "fields", map[string]any{
				"anime_id": anime.MalID,
				"provider": provider.Name(),
			}, "error", err)

			continue
		}
		slog.Info("episodes_provider_availability_hit", "component", "episodes", "fields", map[string]any{
			"anime_id": anime.MalID,
			"provider": provider.Name(),
			"sub":      len(available.Sub),
			"dub":      len(available.Dub),
		})

		return available, provider.Name(), nil
	}
	return domain.EpisodeAvailability{}, "", fmt.Errorf("no episode availability provider matched anime_id=%d", anime.MalID)
}
