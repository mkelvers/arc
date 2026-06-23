package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
)

func (s *EpisodeService) store(ctx context.Context, anime domain.Anime, jikanEpisodes []jikan.Episode, availability domain.EpisodeAvailability, source string, now time.Time, providerSuccess bool) (domain.CanonicalEpisodeList, error) {
	nextRefreshSQL := nextRefreshAt(anime, now)
	episodes := mergeEpisodes(jikanEpisodes, availability, anime.Episodes)
	payload := domain.CanonicalEpisodeList{
		AnimeID:  anime.MalID,
		Episodes: episodes,
		Source:   source,
	}
	if nextRefreshSQL.Valid {
		payload.NextRefreshAt = nextRefreshSQL.Time.Format(time.RFC3339)
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return domain.CanonicalEpisodeList{}, err
	}

	if !s.writeEpisodeAvailabilityCache(ctx, anime, source, body, now, providerSuccess, nextRefreshSQL) {
		return payload, nil
	}

	observability.Info(
		"episodes_refresh_success",
		"episodes",
		"",
		map[string]any{
			"anime_id":     anime.MalID,
			"source":       source,
			"episodes":     len(episodes),
			"next_refresh": payload.NextRefreshAt,
		},
	)
	return payload, nil
}

func (s *EpisodeService) writeEpisodeAvailabilityCache(ctx context.Context, anime domain.Anime, source string, body []byte, now time.Time, providerSuccess bool, nextRefreshSQL sql.NullTime) bool {
	var retryUntil sql.NullTime
	if anime.Airing && providerSuccess {
		retryUntil = sql.NullTime{Time: nextRefreshSQL.Time.Add(retryWindow), Valid: nextRefreshSQL.Valid}
	}

	err := s.queries.UpsertEpisodeAvailabilityCache(ctx, db.UpsertEpisodeAvailabilityCacheParams{
		AnimeID:       int64(anime.MalID),
		Data:          string(body),
		NextRefreshAt: nextRefreshSQL,
		RetryUntilAt:  retryUntil,
		LastAttemptAt: sql.NullTime{Time: now, Valid: true},
		LastSuccessAt: sql.NullTime{Time: now, Valid: providerSuccess},
		FailureCount:  0,
		LastError:     "",
	})
	if err == nil {
		return true
	}

	observability.Warn(
		"episodes_cache_write_failed",
		"episodes",
		"",
		map[string]any{
			"anime_id": anime.MalID,
			"source":   source,
		},
		err,
	)
	return false
}

func (s *EpisodeService) markFailure(ctx context.Context, anime domain.Anime, cause error) {
	now := s.clock.Now()
	next := nextRetryTime(anime, now)
	var retryUntil sql.NullTime
	nextBroadcast := nextBroadcastBeforeOrAt(anime, now)
	if !nextBroadcast.IsZero() {
		retryUntil = sql.NullTime{Time: nextBroadcast.Add(retryWindow), Valid: true}
	}

	var nextSQL sql.NullTime
	if !next.IsZero() {
		nextSQL = sql.NullTime{Time: next, Valid: true}
	}

	writeCtx := ctx
	if ctx.Err() != nil {
		var cancel context.CancelFunc
		writeCtx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
	}
	err := s.queries.MarkEpisodeAvailabilityRefreshFailed(writeCtx, db.MarkEpisodeAvailabilityRefreshFailedParams{
		LastAttemptAt: sql.NullTime{Time: now, Valid: true},
		LastError:     truncate(cause.Error(), 400),
		NextRefreshAt: nextSQL,
		RetryUntilAt:  retryUntil,
		AnimeID:       int64(anime.MalID),
	})
	if err != nil {
		observability.Warn(
			"episodes_mark_failure_failed",
			"episodes",
			"",
			map[string]any{
				"anime_id": anime.MalID,
			},
			err,
		)
		return
	}
	observability.Warn(
		"episodes_refresh_failure_recorded",
		"episodes",
		"",
		map[string]any{
			"anime_id":   anime.MalID,
			"next_retry": next.Format(time.RFC3339),
		},
		cause,
	)
}

func (s *EpisodeService) getCached(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, bool) {
	return s.getDecodedCached(ctx, anime)
}

func (s *EpisodeService) getFreshCached(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, bool) {
	row, err := s.queries.GetEpisodeAvailabilityCache(ctx, int64(anime.MalID))
	if err != nil {
		return domain.CanonicalEpisodeList{}, false
	}

	now := s.clock.Now()
	if !s.isFreshEpisodeCache(anime, row, now) {
		return domain.CanonicalEpisodeList{}, false
	}

	payload, ok := s.decodeCachedPayload(anime, row.Data)
	if !ok {
		return domain.CanonicalEpisodeList{}, false
	}
	observability.Info(
		"episodes_cache_served",
		"episodes",
		"",
		map[string]any{
			"anime_id":     anime.MalID,
			"episodes":     len(payload.Episodes),
			"next_refresh": payload.NextRefreshAt,
		},
	)
	return payload, true
}

func (s *EpisodeService) getDecodedCached(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, bool) {
	row, err := s.queries.GetEpisodeAvailabilityCache(ctx, int64(anime.MalID))
	if err != nil {
		return domain.CanonicalEpisodeList{}, false
	}
	payload, ok := s.decodeCachedPayload(anime, row.Data)
	if !ok {
		return domain.CanonicalEpisodeList{}, false
	}
	return payload, true
}

func (s *EpisodeService) isFreshEpisodeCache(anime domain.Anime, row db.EpisodeAvailabilityCache, now time.Time) bool {
	if row.NextRefreshAt.Valid && !row.NextRefreshAt.Time.After(now) {
		observability.Info(
			"episodes_cache_due_for_refresh",
			"episodes",
			"",
			map[string]any{
				"anime_id":     anime.MalID,
				"next_refresh": row.NextRefreshAt.Time.Format(time.RFC3339),
			},
		)
		return false
	}
	if anime.Airing && row.UpdatedAt.Before(now.Add(-airingFallbackRefreshInterval)) {
		observability.Info(
			"episodes_cache_too_old_for_airing",
			"episodes",
			"",
			map[string]any{
				"anime_id":   anime.MalID,
				"updated_at": row.UpdatedAt.Format(time.RFC3339),
			},
		)
		return false
	}
	return true
}

func (s *EpisodeService) decodeCachedPayload(anime domain.Anime, raw string) (domain.CanonicalEpisodeList, bool) {
	var payload domain.CanonicalEpisodeList
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		observability.Warn(
			"episodes_cached_payload_invalid",
			"episodes",
			"",
			map[string]any{
				"anime_id": anime.MalID,
			},
			err,
		)
		return domain.CanonicalEpisodeList{}, false
	}

	if !isCanonicalEpisodePayloadValid(payload, anime.Episodes) {
		observability.Info(
			"episodes_cached_payload_rejected",
			"episodes",
			"",
			map[string]any{
				"anime_id":        anime.MalID,
				"expected_count":  anime.Episodes,
				"cached_episodes": len(payload.Episodes),
			},
		)
		return domain.CanonicalEpisodeList{}, false
	}

	return payload, true
}
