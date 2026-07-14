package service

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	rediscache "mal/internal/cache/redis"
	"mal/internal/domain"
	"mal/internal/observability"
)

const (
	providerMappingFreshTTL = 30 * 24 * time.Hour
	providerMappingStaleTTL = 7 * 24 * time.Hour
)

type cachedProviderMapping struct {
	ProviderShowID string       `json:"provider_show_id"`
	FailedUntil    sql.NullTime `json:"failed_until"`
	LastError      string       `json:"last_error"`
}

func providerMappingKey(animeID int64, provider string) string {
	return fmt.Sprintf("episodes:provider-mapping:%d:%s", animeID, provider)
}

func (s *EpisodeService) providerID(ctx context.Context, anime domain.Anime, provider domain.EpisodeProvider, titles []string) (string, error) {
	providerID, found, err := s.cachedProviderID(ctx, anime, provider)
	if found || err != nil {
		return providerID, err
	}

	providerID, err = provider.ResolveEpisodeProviderID(ctx, anime.MalID, titles)
	if err != nil {
		s.cacheProviderIDFailure(ctx, anime, provider, err)
		return "", err
	}

	s.cacheProviderIDSuccess(ctx, anime, provider, providerID)
	observability.Info(
		"episodes_provider_id_resolved",
		"episodes",
		"",
		map[string]any{
			"anime_id":    anime.MalID,
			"provider":    provider.Name(),
			"provider_id": providerID,
		},
	)
	return providerID, nil
}

func (s *EpisodeService) cachedProviderID(ctx context.Context, anime domain.Anime, provider domain.EpisodeProvider) (string, bool, error) {
	if s.cache != nil {
		return s.cachedProviderIDFromRedis(ctx, anime, provider)
	}
	return "", false, nil
}

func (s *EpisodeService) cachedProviderIDFromRedis(ctx context.Context, anime domain.Anime, provider domain.EpisodeProvider) (string, bool, error) {
	var mapping cachedProviderMapping
	result, err := s.cache.Get(ctx, providerMappingKey(int64(anime.MalID), provider.Name()), &mapping)
	if err != nil || result.State == rediscache.StateMiss {
		if err != nil {
			observability.Warn("episodes_provider_id_cache_read_failed", "episodes", "", map[string]any{"anime_id": anime.MalID, "provider": provider.Name()}, err)
		}
		return "", false, nil
	}
	return providerMappingCacheResult(mapping, s.clock.Now())
}

func providerMappingCacheResult(mapping cachedProviderMapping, now time.Time) (string, bool, error) {
	if mapping.FailedUntil.Valid && mapping.FailedUntil.Time.After(now) {
		return "", true, fmt.Errorf("cached provider mapping failure active until %s: %s", mapping.FailedUntil.Time.Format(time.RFC3339), mapping.LastError)
	}
	if strings.TrimSpace(mapping.ProviderShowID) == "" {
		return "", false, nil
	}
	return mapping.ProviderShowID, true, nil
}

func (s *EpisodeService) cacheProviderIDFailure(ctx context.Context, anime domain.Anime, provider domain.EpisodeProvider, resolveErr error) {
	if s.cache != nil {
		err := s.cache.Set(ctx, providerMappingKey(int64(anime.MalID), provider.Name()), cachedProviderMapping{
			FailedUntil: sql.NullTime{Time: s.clock.Now().Add(time.Hour), Valid: true},
			LastError:   truncate(resolveErr.Error(), 400),
		}, providerMappingFreshTTL, providerMappingStaleTTL)
		if err != nil {
			observability.Warn("episodes_provider_id_cache_write_failed", "episodes", "", map[string]any{"anime_id": anime.MalID, "provider": provider.Name()}, err)
		}
		return
	}
}

func (s *EpisodeService) cacheProviderIDSuccess(ctx context.Context, anime domain.Anime, provider domain.EpisodeProvider, providerID string) {
	if s.cache != nil {
		err := s.cache.Set(ctx, providerMappingKey(int64(anime.MalID), provider.Name()), cachedProviderMapping{ProviderShowID: providerID}, providerMappingFreshTTL, providerMappingStaleTTL)
		if err != nil {
			observability.Warn("episodes_provider_id_cache_write_failed", "episodes", "", map[string]any{"anime_id": anime.MalID, "provider": provider.Name()}, err)
		}
		return
	}
}
