package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
)

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
	row, err := s.queries.GetEpisodeProviderMapping(ctx, db.GetEpisodeProviderMappingParams{
		AnimeID:  int64(anime.MalID),
		Provider: provider.Name(),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", false, nil
		}
		observability.Warn(
			"episodes_provider_id_cache_read_failed",
			"episodes",
			"",
			map[string]any{
				"anime_id": anime.MalID,
				"provider": provider.Name(),
			},
			err,
		)
		return "", false, nil
	}

	if row.FailedUntil.Valid && row.FailedUntil.Time.After(s.clock.Now()) {
		return "", true, fmt.Errorf("cached provider mapping failure active until %s: %s", row.FailedUntil.Time.Format(time.RFC3339), row.LastError)
	}
	if strings.TrimSpace(row.ProviderShowID) == "" {
		return "", false, nil
	}

	observability.Info(
		"episodes_provider_id_cache_hit",
		"episodes",
		"",
		map[string]any{
			"anime_id":    anime.MalID,
			"provider":    provider.Name(),
			"provider_id": row.ProviderShowID,
		},
	)
	return row.ProviderShowID, true, nil
}

func (s *EpisodeService) cacheProviderIDFailure(ctx context.Context, anime domain.Anime, provider domain.EpisodeProvider, resolveErr error) {
	err := s.queries.UpsertEpisodeProviderMapping(ctx, db.UpsertEpisodeProviderMappingParams{
		AnimeID:        int64(anime.MalID),
		Provider:       provider.Name(),
		ProviderShowID: "",
		FailedUntil:    sql.NullTime{Time: s.clock.Now().Add(time.Hour), Valid: true},
		LastError:      truncate(resolveErr.Error(), 400),
	})
	if err == nil {
		return
	}

	observability.Warn(
		"episodes_provider_id_cache_write_failed",
		"episodes",
		"",
		map[string]any{
			"anime_id": anime.MalID,
			"provider": provider.Name(),
		},
		err,
	)
}

func (s *EpisodeService) cacheProviderIDSuccess(ctx context.Context, anime domain.Anime, provider domain.EpisodeProvider, providerID string) {
	err := s.queries.UpsertEpisodeProviderMapping(ctx, db.UpsertEpisodeProviderMappingParams{
		AnimeID:        int64(anime.MalID),
		Provider:       provider.Name(),
		ProviderShowID: providerID,
		FailedUntil:    sql.NullTime{},
		LastError:      "",
	})
	if err == nil {
		return
	}

	observability.Warn(
		"episodes_provider_id_cache_write_failed",
		"episodes",
		"",
		map[string]any{
			"anime_id": anime.MalID,
			"provider": provider.Name(),
		},
		err,
	)
}
