package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"mal/internal/domain"
	"mal/internal/observability"
)

const episodeAvailabilityPayloadVersion = 4

const (
	episodeCacheFreshTTL = 30 * 24 * time.Hour
	episodeCacheStaleTTL = 7 * 24 * time.Hour
	maxEpisodeStaleAge   = 7 * 24 * time.Hour
)

func episodeCacheKey(animeID int64) string {
	return fmt.Sprintf("episodes:canonical:%d", animeID)
}

type episodeCacheRow struct {
	AnimeID       int64        `json:"anime_id"`
	Data          string       `json:"data"`
	NextRefreshAt sql.NullTime `json:"next_refresh_at"`
	RetryUntilAt  sql.NullTime `json:"retry_until_at"`
	LastAttemptAt sql.NullTime `json:"last_attempt_at"`
	LastSuccessAt sql.NullTime `json:"last_success_at"`
	FailureCount  int64        `json:"failure_count"`
	LastError     string       `json:"last_error"`
	UpdatedAt     time.Time    `json:"updated_at"`
}

func (s *EpisodeService) getEpisodeCache(ctx context.Context, animeID int64) (episodeCacheRow, domain.CacheState, bool) {
	if s.cache != nil {
		var row episodeCacheRow
		result, err := s.cache.Get(ctx, episodeCacheKey(animeID), &row)
		if err != nil || result.State == domain.CacheMiss {
			if err != nil {
				observability.Warn("episodes_cache_read_failed", "episodes", "", map[string]any{"anime_id": animeID}, err)
			}
			return episodeCacheRow{}, result.State, false
		}
		return row, result.State, true
	}

	return episodeCacheRow{}, domain.CacheMiss, false
}

func (s *EpisodeService) setEpisodeCache(ctx context.Context, row episodeCacheRow) error {
	if s.cache == nil {
		return nil
	}
	return s.cache.Set(ctx, episodeCacheKey(row.AnimeID), row, episodeCacheFreshTTL, episodeCacheStaleTTL)
}

func (s *EpisodeService) store(ctx context.Context, anime domain.Anime, availability domain.EpisodeAvailability, source string, now time.Time) (domain.CanonicalEpisodeList, error) {
	nextRefreshSQL := nextRefreshAt(anime, now)
	episodes := mergeEpisodes(nil, availability, 0)
	payload := domain.CanonicalEpisodeList{
		AnimeID:             anime.MalID,
		Episodes:            episodes,
		Source:              source,
		AvailabilityVersion: episodeAvailabilityPayloadVersion,
		ReleaseChecked:      false,
		LastAttemptAt:       now.Format(time.RFC3339),
		FailureCount:        0,
	}
	payload.LastSuccessAt = now.Format(time.RFC3339)
	if nextRefreshSQL.Valid {
		payload.NextRefreshAt = nextRefreshSQL.Time.Format(time.RFC3339)
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return domain.CanonicalEpisodeList{}, err
	}

	if !s.writeEpisodeAvailabilityCache(episodeCacheWrite{ctx: ctx, anime: anime, source: source, body: body, now: now, providerSuccess: true, nextRefreshSQL: nextRefreshSQL}) {
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

type episodeCacheWrite struct {
	ctx             context.Context
	anime           domain.Anime
	source          string
	body            []byte
	now             time.Time
	providerSuccess bool
	nextRefreshSQL  sql.NullTime
}

func (s *EpisodeService) writeEpisodeAvailabilityCache(input episodeCacheWrite) bool {
	ctx, anime, source, body, now := input.ctx, input.anime, input.source, input.body, input.now
	providerSuccess, nextRefreshSQL := input.providerSuccess, input.nextRefreshSQL
	var retryUntil sql.NullTime
	if anime.Airing && providerSuccess {
		retryUntil = sql.NullTime{Time: nextRefreshSQL.Time.Add(retryWindow), Valid: nextRefreshSQL.Valid}
	}

	err := s.setEpisodeCache(ctx, episodeCacheRow{
		AnimeID:       int64(anime.MalID),
		Data:          string(body),
		NextRefreshAt: nextRefreshSQL,
		RetryUntilAt:  retryUntil,
		LastAttemptAt: sql.NullTime{Time: now, Valid: true},
		LastSuccessAt: sql.NullTime{Time: now, Valid: providerSuccess},
		FailureCount:  0,
		LastError:     "",
		UpdatedAt:     now,
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
	row, _, found := s.getEpisodeCache(writeCtx, int64(anime.MalID))
	if !found {
		row = episodeCacheRow{AnimeID: int64(anime.MalID)}
	}
	row.LastAttemptAt = sql.NullTime{Time: now, Valid: true}
	row.LastError = truncate(cause.Error(), 400)
	row.NextRefreshAt = nextSQL
	row.RetryUntilAt = retryUntil
	row.FailureCount++
	row.UpdatedAt = now
	err := s.setEpisodeCache(writeCtx, row)
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

func (s *EpisodeService) getFreshCached(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, bool) {
	row, state, ok := s.getEpisodeCache(ctx, int64(anime.MalID))
	if !ok || (s.cache != nil && state != domain.CacheFresh) {
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
	payload = enrichCachedPayload(payload, row)
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
	row, state, ok := s.getEpisodeCache(ctx, int64(anime.MalID))
	if !ok {
		return domain.CanonicalEpisodeList{}, false
	}
	if s.cache != nil && state == domain.CacheStale && row.LastSuccessAt.Valid && s.clock.Now().Sub(row.LastSuccessAt.Time) >= maxEpisodeStaleAge {
		return domain.CanonicalEpisodeList{}, false
	}
	payload, ok := s.decodeCachedPayload(anime, row.Data)
	if !ok {
		return domain.CanonicalEpisodeList{}, false
	}
	payload = enrichCachedPayload(payload, row)
	return payload, true
}

func (s *EpisodeService) cachedEpisodePayload(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, episodeCacheRow, bool) {
	row, _, ok := s.getEpisodeCache(ctx, int64(anime.MalID))
	if !ok {
		return domain.CanonicalEpisodeList{}, episodeCacheRow{}, false
	}
	payload, ok := s.decodeCachedPayload(anime, row.Data)
	if !ok {
		return domain.CanonicalEpisodeList{}, episodeCacheRow{}, false
	}
	return enrichCachedPayload(payload, row), row, true
}

func enrichCachedPayload(payload domain.CanonicalEpisodeList, row episodeCacheRow) domain.CanonicalEpisodeList {
	if row.NextRefreshAt.Valid {
		payload.NextRefreshAt = row.NextRefreshAt.Time.Format(time.RFC3339)
	}
	if row.RetryUntilAt.Valid {
		payload.RetryUntilAt = row.RetryUntilAt.Time.Format(time.RFC3339)
	}
	if row.LastAttemptAt.Valid {
		payload.LastAttemptAt = row.LastAttemptAt.Time.Format(time.RFC3339)
	}
	if row.LastSuccessAt.Valid {
		payload.LastSuccessAt = row.LastSuccessAt.Time.Format(time.RFC3339)
	}
	payload.FailureCount = row.FailureCount
	return payload
}

func cloneCanonicalEpisodeList(payload domain.CanonicalEpisodeList) domain.CanonicalEpisodeList {
	if len(payload.Episodes) == 0 {
		return payload
	}
	payload.Episodes = append([]domain.CanonicalEpisode(nil), payload.Episodes...)
	return payload
}

func (s *EpisodeService) isFreshEpisodeCache(anime domain.Anime, row episodeCacheRow, now time.Time) bool {
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
	if isStaleProviderEpisodePayload(payload) {
		observability.Info(
			"episodes_cached_payload_rejected_stale_version",
			"episodes",
			"",
			map[string]any{
				"anime_id":             anime.MalID,
				"cached_episodes":      len(payload.Episodes),
				"source":               payload.Source,
				"availability_version": payload.AvailabilityVersion,
			},
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

func isStaleProviderEpisodePayload(payload domain.CanonicalEpisodeList) bool {
	return payload.Source != "" && payload.AvailabilityVersion < episodeAvailabilityPayloadVersion
}
