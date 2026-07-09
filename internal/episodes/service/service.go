// Package service provides episode availability checking logic.
package service

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"mal/integrations/jikan"
	"mal/internal/database/db"
	"mal/internal/domain"
	"mal/internal/observability"

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
	queries            *db.Queries
	jikan              *jikan.Client
	providers          []domain.EpisodeAvailabilityProvider
	titles             domain.EpisodeTitleProvider
	clock              Clock
	enabled            bool
	canonicalRefresh   singleflight.Group
	titleLoad          singleflight.Group
	classificationLoad singleflight.Group
	cacheMu            sync.Mutex
}

func NewEpisodeService(queries *db.Queries, jikanClient *jikan.Client, providers []domain.EpisodeAvailabilityProvider, titles domain.EpisodeTitleProvider, enabled bool) domain.EpisodeService {
	return NewEpisodeServiceWithClock(queries, jikanClient, providers, titles, enabled, realClock{})
}

func NewEpisodeServiceWithClock(queries *db.Queries, jikanClient *jikan.Client, providers []domain.EpisodeAvailabilityProvider, titles domain.EpisodeTitleProvider, enabled bool, clock Clock) *EpisodeService {
	return &EpisodeService{
		queries:   queries,
		jikan:     jikanClient,
		providers: providers,
		titles:    titles,
		clock:     clock,
		enabled:   enabled,
	}
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
		observability.Warn(
			"episodes_refresh_wait_cancelled",
			"episodes",
			"",
			map[string]any{
				"anime_id":    anime.MalID,
				"policy":      string(policy),
				"duration_ms": time.Since(startedAt).Milliseconds(),
			},
			ctx.Err(),
		)
		return domain.CanonicalEpisodeList{}, ctx.Err()
	case result := <-resultCh:
		if result.Shared {
			observability.Info(
				"episodes_refresh_shared",
				"episodes",
				"",
				map[string]any{
					"anime_id":    anime.MalID,
					"policy":      string(policy),
					"duration_ms": time.Since(startedAt).Milliseconds(),
				},
			)
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
			observability.Info(
				"episodes_refresh_cache_hit_after_join",
				"episodes",
				"",
				map[string]any{
					"anime_id": anime.MalID,
					"policy":   string(policy),
				},
			)
			return cloneCanonicalEpisodeList(cached), nil
		}
	}
	return s.refresh(refreshCtx, anime)
}

func (s *EpisodeService) RefreshTrackedDue(ctx context.Context, limit int) error {
	if !s.enabled {
		return nil
	}
	if limit <= 0 {
		limit = 25
	}

	ids, err := s.queries.GetTrackedAiringAnimeIDsDueForEpisodeRefresh(ctx, int64(limit))
	if err != nil {
		return fmt.Errorf("get due tracked anime: %w", err)
	}

	for i, id := range ids {
		if ctx.Err() != nil {
			observability.Warn(
				"episodes_worker_tick_interrupted",
				"episodes",
				"",
				map[string]any{
					"anime_id":  id,
					"remaining": len(ids) - i,
				},
				ctx.Err(),
			)
			break
		}
		anime, err := s.jikan.GetAnimeByID(ctx, int(id))
		if err != nil {
			observability.Warn(
				"episodes_refresh_fetch_anime_failed",
				"episodes",
				"",
				map[string]any{
					"anime_id": id,
				},
				err,
			)
			continue
		}
		if _, err := s.refresh(ctx, domain.Anime{Anime: anime}); err != nil {
			observability.Warn(
				"episodes_refresh_failed",
				"episodes",
				"",
				map[string]any{
					"anime_id": id,
				},
				err,
			)
		}
	}

	return nil
}

func (s *EpisodeService) refresh(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, error) {
	now := s.clock.Now()
	observability.Info(
		"episodes_refresh_start",
		"episodes",
		"",
		map[string]any{
			"anime_id": anime.MalID,
			"title":    anime.DisplayTitle(),
			"airing":   anime.Airing,
		},
	)

	availability, source, providerErr := s.fetchProviderAvailability(ctx, anime)
	if providerErr != nil {
		s.markFailure(ctx, anime, providerErr)
		if cached, ok := s.getDecodedCached(ctx, anime); ok {
			observability.Warn(
				"episodes_provider_failed_serving_stale_cache",
				"episodes",
				"",
				map[string]any{
					"anime_id": anime.MalID,
				},
				providerErr,
			)
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
			observability.Warn(
				"episodes_provider_id_miss",
				"episodes",
				"",
				map[string]any{
					"anime_id": anime.MalID,
					"provider": provider.Name(),
				},
				err,
			)
			continue
		}

		available, err := provider.GetEpisodeAvailabilityByProviderID(ctx, providerID)
		if err != nil {
			observability.Warn(
				"episodes_provider_availability_miss",
				"episodes",
				"",
				map[string]any{
					"anime_id": anime.MalID,
					"provider": provider.Name(),
				},
				err,
			)
			continue
		}
		observability.Info(
			"episodes_provider_availability_hit",
			"episodes",
			"",
			map[string]any{
				"anime_id": anime.MalID,
				"provider": provider.Name(),
				"sub":      len(available.Sub),
				"dub":      len(available.Dub),
			},
		)
		return available, provider.Name(), nil
	}
	return domain.EpisodeAvailability{}, "", fmt.Errorf("no episode availability provider matched anime_id=%d", anime.MalID)
}
