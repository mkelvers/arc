// Package service provides episode availability checking logic.
package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	retryInterval                 = 15 * time.Minute
	retryWindow                   = 3 * time.Hour
	airingFallbackRefreshInterval = 6 * time.Hour
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
	metrics   *observability.Metrics
}

func NewEpisodeService(queries *db.Queries, jikanClient *jikan.Client, providers []domain.EpisodeAvailabilityProvider, enabled bool, metrics *observability.Metrics) domain.EpisodeService {
	return NewEpisodeServiceWithClock(queries, jikanClient, providers, enabled, realClock{}, metrics)
}

func NewEpisodeServiceWithClock(queries *db.Queries, jikanClient *jikan.Client, providers []domain.EpisodeAvailabilityProvider, enabled bool, clock Clock, metrics *observability.Metrics) *EpisodeService {
	return &EpisodeService{
		queries:   queries,
		jikan:     jikanClient,
		providers: providers,
		clock:     clock,
		enabled:   enabled,
		metrics:   metrics,
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

	providerAvailability, source, providerErr := s.fetchProviderAvailability(ctx, anime)
	if providerErr != nil {
		s.markFailure(ctx, anime, providerErr)
		if cached, ok := s.getCached(ctx, anime.MalID); ok {
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

	return s.store(ctx, anime, jikanEpisodes, providerAvailability, source, now, true)
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

func (s *EpisodeService) providerID(ctx context.Context, anime domain.Anime, provider domain.EpisodeAvailabilityProvider, titles []string) (string, error) {
	row, err := s.queries.GetEpisodeProviderMapping(ctx, db.GetEpisodeProviderMappingParams{
		AnimeID:  int64(anime.MalID),
		Provider: provider.Name(),
	})
	if err == nil {
		if row.FailedUntil.Valid && row.FailedUntil.Time.After(s.clock.Now()) {
			s.metrics.ObserveCache("episode_provider_mapping", "hit")
			return "", fmt.Errorf("cached provider mapping failure active until %s: %s", row.FailedUntil.Time.Format(time.RFC3339), row.LastError)
		}
		if strings.TrimSpace(row.ProviderShowID) != "" {
			s.metrics.ObserveCache("episode_provider_mapping", "hit")
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
			return row.ProviderShowID, nil
		}
		s.metrics.ObserveCache("episode_provider_mapping", "miss")
	} else if !errors.Is(err, sql.ErrNoRows) {
		s.metrics.ObserveCache("episode_provider_mapping", "miss")
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
	} else {
		s.metrics.ObserveCache("episode_provider_mapping", "miss")
	}

	providerID, err := provider.ResolveEpisodeProviderID(ctx, anime.MalID, titles)
	if err != nil {
		_ = s.queries.UpsertEpisodeProviderMapping(ctx, db.UpsertEpisodeProviderMappingParams{
			AnimeID:        int64(anime.MalID),
			Provider:       provider.Name(),
			ProviderShowID: "",
			FailedUntil:    sql.NullTime{Time: s.clock.Now().Add(time.Hour), Valid: true},
			LastError:      truncate(err.Error(), 400),
		})
		return "", err
	}

	err = s.queries.UpsertEpisodeProviderMapping(ctx, db.UpsertEpisodeProviderMappingParams{
		AnimeID:        int64(anime.MalID),
		Provider:       provider.Name(),
		ProviderShowID: providerID,
		FailedUntil:    sql.NullTime{},
		LastError:      "",
	})
	if err != nil {
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

func (s *EpisodeService) store(ctx context.Context, anime domain.Anime, jikanEpisodes []jikan.Episode, availability domain.EpisodeAvailability, source string, now time.Time, providerSuccess bool) (domain.CanonicalEpisodeList, error) {
	var nextRefreshSQL sql.NullTime
	if anime.Airing {
		// During the hours immediately following a broadcast time, providers can lag.
		// Keep retrying for a short window, even if the provider request succeeded.
		lastBroadcast := nextBroadcastBeforeOrAt(anime, now)
		if !lastBroadcast.IsZero() && now.Before(lastBroadcast.Add(retryWindow)) {
			nextRefreshSQL = sql.NullTime{Time: now.Add(retryInterval).UTC(), Valid: true}
		} else {
			next := nextBroadcastAfter(anime, now)
			if !next.IsZero() {
				nextRefreshSQL = sql.NullTime{Time: next, Valid: true}
			} else {
				// Broadcast metadata is often missing or wrong for currently airing shows.
				// Avoid "never refresh again" caches by falling back to a fixed interval.
				nextRefreshSQL = sql.NullTime{Time: now.Add(airingFallbackRefreshInterval).UTC(), Valid: true}
			}
		}
	}

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

	var retryUntil sql.NullTime
	if anime.Airing && providerSuccess {
		retryUntil = sql.NullTime{Time: nextRefreshSQL.Time.Add(retryWindow), Valid: nextRefreshSQL.Valid}
	}

	err = s.queries.UpsertEpisodeAvailabilityCache(ctx, db.UpsertEpisodeAvailabilityCacheParams{
		AnimeID:       int64(anime.MalID),
		Data:          string(body),
		NextRefreshAt: nextRefreshSQL,
		RetryUntilAt:  retryUntil,
		LastAttemptAt: sql.NullTime{Time: now, Valid: true},
		LastSuccessAt: sql.NullTime{Time: now, Valid: providerSuccess},
		FailureCount:  0,
		LastError:     "",
	})
	if err != nil {
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

func (s *EpisodeService) getCached(ctx context.Context, animeID int) (domain.CanonicalEpisodeList, bool) {
	row, err := s.queries.GetEpisodeAvailabilityCache(ctx, int64(animeID))
	if err != nil {
		s.metrics.ObserveCache("episode_availability", "miss")
		return domain.CanonicalEpisodeList{}, false
	}
	var payload domain.CanonicalEpisodeList
	if err := json.Unmarshal([]byte(row.Data), &payload); err != nil {
		s.metrics.ObserveCache("episode_availability", "miss")
		observability.Warn(
			"episodes_cached_payload_invalid",
			"episodes",
			"",
			map[string]any{
				"anime_id": animeID,
			},
			err,
		)
		return domain.CanonicalEpisodeList{}, false
	}
	s.metrics.ObserveCache("episode_availability", "hit")
	return payload, true
}

func (s *EpisodeService) getFreshCached(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, bool) {
	row, err := s.queries.GetEpisodeAvailabilityCache(ctx, int64(anime.MalID))
	if err != nil {
		s.metrics.ObserveCache("episode_availability_fresh", "miss")
		return domain.CanonicalEpisodeList{}, false
	}

	now := s.clock.Now()
	if row.NextRefreshAt.Valid && !row.NextRefreshAt.Time.After(now) {
		s.metrics.ObserveCache("episode_availability_fresh", "miss")
		observability.Info(
			"episodes_cache_due_for_refresh",
			"episodes",
			"",
			map[string]any{
				"anime_id":     anime.MalID,
				"next_refresh": row.NextRefreshAt.Time.Format(time.RFC3339),
			},
		)
		return domain.CanonicalEpisodeList{}, false
	}

	if anime.Airing && row.UpdatedAt.Before(now.Add(-airingFallbackRefreshInterval)) {
		s.metrics.ObserveCache("episode_availability_fresh", "miss")
		observability.Info(
			"episodes_cache_too_old_for_airing",
			"episodes",
			"",
			map[string]any{
				"anime_id":   anime.MalID,
				"updated_at": row.UpdatedAt.Format(time.RFC3339),
			},
		)
		return domain.CanonicalEpisodeList{}, false
	}

	var payload domain.CanonicalEpisodeList
	if err := json.Unmarshal([]byte(row.Data), &payload); err != nil {
		s.metrics.ObserveCache("episode_availability_fresh", "miss")
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
		s.metrics.ObserveCache("episode_availability_fresh", "miss")
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
	s.metrics.ObserveCache("episode_availability_fresh", "hit")
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

func isCanonicalEpisodePayloadValid(payload domain.CanonicalEpisodeList, expectedCount int) bool {
	if expectedCount <= 0 {
		return true
	}
	if len(payload.Episodes) > expectedCount {
		return false
	}
	for _, episode := range payload.Episodes {
		if episode.Number <= 0 || episode.Number > expectedCount {
			return false
		}
	}
	return true
}

func (s *EpisodeService) jikanOnly(ctx context.Context, anime domain.Anime, source string) (domain.CanonicalEpisodeList, error) {
	episodes, err := s.jikan.GetAllEpisodes(ctx, anime.MalID)
	if err != nil {
		return domain.CanonicalEpisodeList{}, err
	}
	return domain.CanonicalEpisodeList{
		AnimeID:  anime.MalID,
		Episodes: mergeEpisodes(episodes, domain.EpisodeAvailability{}, anime.Episodes),
		Source:   source,
	}, nil
}

func titleCandidates(anime domain.Anime) []string {
	out := []string{anime.Title}
	if anime.TitleEnglish != "" && anime.TitleEnglish != anime.Title {
		out = append(out, anime.TitleEnglish)
	}
	if anime.TitleJapanese != "" {
		out = append(out, anime.TitleJapanese)
	}
	for _, syn := range anime.TitleSynonyms {
		if syn != "" && syn != anime.Title && syn != anime.TitleEnglish && syn != anime.TitleJapanese {
			out = append(out, syn)
		}
	}
	return out
}

type episodePartial struct {
	title  string
	filler bool
	recap  bool
	sub    bool
	dub    bool
}

func mergeEpisodes(jikanEpisodes []jikan.Episode, availability domain.EpisodeAvailability, expectedCount int) []domain.CanonicalEpisode {
	byNumber := map[int]episodePartial{}

	for i, ep := range jikanEpisodes {
		if exceedsExpectedCount(i+1, expectedCount) {
			break
		}
		number, ok := jikanEpisodeNumber(ep, i)
		if !ok || exceedsExpectedCount(number, expectedCount) {
			continue
		}
		mergeEpisode(&byNumber, number, func(item *episodePartial) {
			item.title = strings.TrimSpace(ep.Title)
			item.filler = ep.Filler
			item.recap = ep.Recap
		})
	}
	mergeAvailability(&byNumber, availability.Sub, expectedCount, func(item *episodePartial) { item.sub = true })
	mergeAvailability(&byNumber, availability.Dub, expectedCount, func(item *episodePartial) { item.dub = true })

	numbers := make([]int, 0, len(byNumber))
	for number := range byNumber {
		numbers = append(numbers, number)
	}
	sort.Ints(numbers)

	episodes := make([]domain.CanonicalEpisode, 0, len(numbers))
	for _, number := range numbers {
		item := byNumber[number]
		title := item.title
		if title == "" {
			title = fmt.Sprintf("Episode %d", number)
		}
		episodes = append(episodes, domain.CanonicalEpisode{
			Number:  number,
			Title:   title,
			HasSub:  item.sub,
			HasDub:  item.dub,
			SubOnly: item.sub && !item.dub,
			Filler:  item.filler,
			Recap:   item.recap,
		})
	}
	return episodes
}

func mergeEpisode(byNumber *map[int]episodePartial, number int, update func(*episodePartial)) {
	item := (*byNumber)[number]
	update(&item)
	(*byNumber)[number] = item
}

func mergeAvailability(byNumber *map[int]episodePartial, numbers []int, expectedCount int, update func(*episodePartial)) {
	for _, number := range numbers {
		if number <= 0 || exceedsExpectedCount(number, expectedCount) {
			continue
		}
		mergeEpisode(byNumber, number, update)
	}
}

func jikanEpisodeNumber(ep jikan.Episode, index int) (int, bool) {
	number, err := strconv.Atoi(strings.TrimSpace(ep.Episode))
	if err == nil && number > 0 {
		return number, true
	}
	if index < 0 {
		return 0, false
	}
	return index + 1, true
}

func exceedsExpectedCount(number int, expectedCount int) bool {
	return expectedCount > 0 && number > expectedCount
}

func nextRetryTime(anime domain.Anime, now time.Time) time.Time {
	broadcast := nextBroadcastBeforeOrAt(anime, now)
	if broadcast.IsZero() || now.After(broadcast.Add(retryWindow)) {
		return nextBroadcastAfter(anime, now)
	}
	return now.Add(retryInterval)
}

func nextBroadcastBeforeOrAt(anime domain.Anime, now time.Time) time.Time {
	next := nextBroadcastAfter(anime, now.AddDate(0, 0, -7))
	if next.IsZero() || next.After(now) {
		return time.Time{}
	}
	return next
}

func nextBroadcastAfter(anime domain.Anime, after time.Time) time.Time {
	day := weekdayFromJikan(anime.Broadcast.Day)
	if day < 0 || strings.TrimSpace(anime.Broadcast.Time) == "" {
		return time.Time{}
	}

	loc := time.UTC
	if tz := strings.TrimSpace(anime.Broadcast.Timezone); tz != "" {
		if loaded, err := time.LoadLocation(tz); err == nil {
			loc = loaded
		} else {
			observability.Warn(
				"episodes_broadcast_timezone_parse_failed",
				"episodes",
				"",
				map[string]any{
					"anime_id": anime.MalID,
					"timezone": tz,
				},
				err,
			)
		}
	}

	hour, minute, ok := parseBroadcastTime(anime.Broadcast.Time)
	if !ok {
		observability.Warn(
			"episodes_broadcast_time_parse_failed",
			"episodes",
			"",
			map[string]any{
				"anime_id": anime.MalID,
				"time":     anime.Broadcast.Time,
			},
			nil,
		)
		return time.Time{}
	}

	localAfter := after.In(loc)
	daysAhead := (int(day) - int(localAfter.Weekday()) + 7) % 7
	candidate := time.Date(localAfter.Year(), localAfter.Month(), localAfter.Day()+daysAhead, hour, minute, 0, 0, loc)
	if !candidate.After(localAfter) {
		candidate = candidate.AddDate(0, 0, 7)
	}
	return candidate.UTC()
}

func weekdayFromJikan(day string) time.Weekday {
	switch strings.ToLower(strings.TrimSpace(day)) {
	case "sundays":
		return time.Sunday
	case "mondays":
		return time.Monday
	case "tuesdays":
		return time.Tuesday
	case "wednesdays":
		return time.Wednesday
	case "thursdays":
		return time.Thursday
	case "fridays":
		return time.Friday
	case "saturdays":
		return time.Saturday
	default:
		return -1
	}
}

func parseBroadcastTime(value string) (int, int, bool) {
	t, err := time.Parse("15:04", strings.TrimSpace(value))
	if err != nil {
		return 0, 0, false
	}
	return t.Hour(), t.Minute(), true
}

func truncate(value string, maxLen int) string {
	if len(value) <= maxLen {
		return value
	}
	return value[:maxLen]
}
