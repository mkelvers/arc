package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
	"sort"
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

	for _, id := range ids {
		anime, err := s.jikan.GetAnimeByID(ctx, int(id))
		if err != nil {
			log.Printf("episodes: failed to fetch anime for refresh anime_id=%d error=%v", id, err)
			continue
		}
		if _, err := s.refresh(ctx, anime); err != nil {
			log.Printf("episodes: refresh failed anime_id=%d error=%v", id, err)
		}
	}

	return nil
}

func (s *EpisodeService) refresh(ctx context.Context, anime domain.Anime) (domain.CanonicalEpisodeList, error) {
	now := s.clock.Now()
	log.Printf("episodes: refresh start anime_id=%d title=%q airing=%t", anime.MalID, anime.DisplayTitle(), anime.Airing)

	jikanEpisodes, jikanErr := s.jikan.GetAllEpisodes(ctx, anime.MalID)
	if jikanErr != nil {
		log.Printf("episodes: jikan episode metadata failed anime_id=%d error=%v", anime.MalID, jikanErr)
	}

	providerAvailability, source, providerErr := s.fetchProviderAvailability(ctx, anime)
	if providerErr != nil {
		s.markFailure(ctx, anime, providerErr)
		if cached, ok := s.getCached(ctx, anime.MalID); ok {
			log.Printf("episodes: serving stale cache after provider failure anime_id=%d error=%v", anime.MalID, providerErr)
			return cached, nil
		}
		if jikanErr == nil {
			return s.store(ctx, anime, jikanEpisodes, domain.EpisodeAvailability{}, "jikan_fallback", now, false)
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
			log.Printf("episodes: provider id miss anime_id=%d provider=%s error=%v", anime.MalID, provider.Name(), err)
			continue
		}

		available, err := provider.GetEpisodeAvailabilityByProviderID(ctx, providerID)
		if err != nil {
			log.Printf("episodes: provider availability miss anime_id=%d provider=%s error=%v", anime.MalID, provider.Name(), err)
			continue
		}
		log.Printf("episodes: provider availability hit anime_id=%d provider=%s sub=%d dub=%d", anime.MalID, provider.Name(), len(available.Sub), len(available.Dub))
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
			log.Printf("episodes: provider id cache hit anime_id=%d provider=%s provider_id=%s", anime.MalID, provider.Name(), row.ProviderShowID)
			return row.ProviderShowID, nil
		}
		s.metrics.ObserveCache("episode_provider_mapping", "miss")
	} else if !errors.Is(err, sql.ErrNoRows) {
		s.metrics.ObserveCache("episode_provider_mapping", "miss")
		log.Printf("episodes: provider id cache read failed anime_id=%d provider=%s error=%v", anime.MalID, provider.Name(), err)
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
		log.Printf("episodes: provider id cache write failed anime_id=%d provider=%s error=%v", anime.MalID, provider.Name(), err)
	}
	log.Printf("episodes: provider id resolved anime_id=%d provider=%s provider_id=%s", anime.MalID, provider.Name(), providerID)
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

	episodes := mergeEpisodes(jikanEpisodes, availability)
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
		log.Printf("episodes: cache write failed anime_id=%d source=%s error=%v", anime.MalID, source, err)
		return payload, nil
	}

	log.Printf("episodes: refresh success anime_id=%d source=%s episodes=%d next_refresh=%s", anime.MalID, source, len(episodes), payload.NextRefreshAt)
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

	err := s.queries.MarkEpisodeAvailabilityRefreshFailed(ctx, db.MarkEpisodeAvailabilityRefreshFailedParams{
		LastAttemptAt: sql.NullTime{Time: now, Valid: true},
		LastError:     truncate(cause.Error(), 400),
		NextRefreshAt: nextSQL,
		RetryUntilAt:  retryUntil,
		AnimeID:       int64(anime.MalID),
	})
	if err != nil {
		log.Printf("episodes: failed to mark refresh failure anime_id=%d error=%v", anime.MalID, err)
		return
	}
	log.Printf("episodes: refresh failure recorded anime_id=%d next_retry=%s error=%v", anime.MalID, next.Format(time.RFC3339), cause)
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
		log.Printf("episodes: invalid cached payload anime_id=%d error=%v", animeID, err)
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
		log.Printf("episodes: cached availability due for refresh anime_id=%d next_refresh=%s", anime.MalID, row.NextRefreshAt.Time.Format(time.RFC3339))
		return domain.CanonicalEpisodeList{}, false
	}

	if anime.Airing && row.UpdatedAt.Before(now.Add(-airingFallbackRefreshInterval)) {
		s.metrics.ObserveCache("episode_availability_fresh", "miss")
		log.Printf("episodes: cached availability too old for airing anime_id=%d updated_at=%s", anime.MalID, row.UpdatedAt.Format(time.RFC3339))
		return domain.CanonicalEpisodeList{}, false
	}

	var payload domain.CanonicalEpisodeList
	if err := json.Unmarshal([]byte(row.Data), &payload); err != nil {
		s.metrics.ObserveCache("episode_availability_fresh", "miss")
		log.Printf("episodes: invalid cached payload anime_id=%d error=%v", anime.MalID, err)
		return domain.CanonicalEpisodeList{}, false
	}
	s.metrics.ObserveCache("episode_availability_fresh", "hit")
	log.Printf("episodes: served cached availability anime_id=%d episodes=%d next_refresh=%s", anime.MalID, len(payload.Episodes), payload.NextRefreshAt)
	return payload, true
}

func (s *EpisodeService) jikanOnly(ctx context.Context, anime domain.Anime, source string) (domain.CanonicalEpisodeList, error) {
	episodes, err := s.jikan.GetAllEpisodes(ctx, anime.MalID)
	if err != nil {
		return domain.CanonicalEpisodeList{}, err
	}
	return domain.CanonicalEpisodeList{
		AnimeID:  anime.MalID,
		Episodes: mergeEpisodes(episodes, domain.EpisodeAvailability{}),
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

func mergeEpisodes(jikanEpisodes []jikan.Episode, availability domain.EpisodeAvailability) []domain.CanonicalEpisode {
	type partial struct {
		title  string
		filler bool
		recap  bool
		sub    bool
		dub    bool
	}
	byNumber := map[int]partial{}

	for _, ep := range jikanEpisodes {
		if ep.MalID <= 0 {
			continue
		}
		item := byNumber[ep.MalID]
		item.title = strings.TrimSpace(ep.Title)
		item.filler = ep.Filler
		item.recap = ep.Recap
		byNumber[ep.MalID] = item
	}
	for _, n := range availability.Sub {
		if n <= 0 {
			continue
		}
		item := byNumber[n]
		item.sub = true
		byNumber[n] = item
	}
	for _, n := range availability.Dub {
		if n <= 0 {
			continue
		}
		item := byNumber[n]
		item.dub = true
		byNumber[n] = item
	}

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
			log.Printf("episodes: failed to parse broadcast timezone anime_id=%d timezone=%q error=%v", anime.MalID, tz, err)
		}
	}

	hour, minute, ok := parseBroadcastTime(anime.Broadcast.Time)
	if !ok {
		log.Printf("episodes: failed to parse broadcast time anime_id=%d time=%q", anime.MalID, anime.Broadcast.Time)
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
