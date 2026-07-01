// Package service provides episode availability checking logic.
package service

import (
	"context"
	"fmt"
	"time"

	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
)

type Clock interface {
	Now() time.Time
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

type EpisodeService struct {
	queries   *db.Queries
	jikan     *jikan.Client
	providers []domain.EpisodeAvailabilityProvider
	clock     Clock
	enabled   bool
}

func NewEpisodeService(queries *db.Queries, jikanClient *jikan.Client, providers []domain.EpisodeAvailabilityProvider, enabled bool) domain.EpisodeService {
	return NewEpisodeServiceWithClock(queries, jikanClient, providers, enabled, realClock{})
}

func NewEpisodeServiceWithClock(queries *db.Queries, jikanClient *jikan.Client, providers []domain.EpisodeAvailabilityProvider, enabled bool, clock Clock) *EpisodeService {
	return &EpisodeService{
		queries:   queries,
		jikan:     jikanClient,
		providers: providers,
		clock:     clock,
		enabled:   enabled,
	}
}

func (s *EpisodeService) GetCanonicalEpisodes(ctx context.Context, anime domain.Anime, forceRefresh bool) (domain.CanonicalEpisodeList, error) {
	if !s.enabled {
		return s.jikanOnly(ctx, anime, "legacy_disabled")
	}

	if !forceRefresh {
		if cached, ok := s.getFreshCached(ctx, anime); ok {
			return cached, nil
		}
	}

	return s.refresh(ctx, anime)
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

	jikanEpisodes, jikanErr := s.jikan.GetAllEpisodes(ctx, anime.MalID)
	if jikanErr != nil {
		observability.Warn(
			"episodes_jikan_metadata_failed",
			"episodes",
			"",
			map[string]any{
				"anime_id": anime.MalID,
			},
			jikanErr,
		)
	}

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
		if jikanErr == nil {
			storeCtx := ctx
			if ctx.Err() != nil {
				var cancel context.CancelFunc
				storeCtx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
			}
			return s.store(storeCtx, anime, jikanEpisodes, domain.EpisodeAvailability{}, "jikan_fallback", now, false)
		}
		return domain.CanonicalEpisodeList{}, providerErr
	}

	return s.store(ctx, anime, jikanEpisodes, availability, source, now, true)
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

func (s *EpisodeService) jikanOnly(ctx context.Context, anime domain.Anime, source string) (domain.CanonicalEpisodeList, error) {
	episodes, err := s.jikan.GetAllEpisodes(ctx, anime.MalID)
	if err != nil {
		return domain.CanonicalEpisodeList{}, err
	}
	return domain.CanonicalEpisodeList{
		AnimeID:             anime.MalID,
		Episodes:            mergeEpisodesForAnime(anime, episodes, domain.EpisodeAvailability{}, s.clock.Now(), false),
		Source:              source,
		AvailabilityVersion: episodeAvailabilityPayloadVersion,
		ReleaseChecked:      true,
	}, nil
}
