package anime

import (
	"context"
	"mal/internal/anime/recommendations"
	"mal/internal/domain"
	"mal/internal/observability"
	"maps"
	"strings"
	"sync"
	"time"
)

type recommendationComputeFunc func(context.Context, string, int) (domain.CatalogSectionData, error)

type topPicksCacheKey struct {
	userID string
	limit  int
}

type topPicksCacheEntry struct {
	data       domain.CatalogSectionData
	updatedAt  time.Time
	hasResult  bool
	refreshing bool
	stale      bool
	failed     bool
	retryAt    time.Time
}

type topPicksCache struct {
	mu      sync.Mutex
	entries map[topPicksCacheKey]*topPicksCacheEntry
}

const (
	topPicksRefreshTimeout = 30 * time.Second
	topPicksRetryDelay     = 15 * time.Second
)

func (s *animeService) GetTopPickForYou(_ context.Context, userID string) (domain.CatalogSectionData, error) {
	data := s.getCachedTopPicksForYou(userID, recommendations.TopPicksLimit)
	if len(data.Animes) > recommendations.TopPickLimit {
		data.Animes = data.Animes[:recommendations.TopPickLimit]
	}
	return data, nil
}

func (s *animeService) GetTopPicksForYou(_ context.Context, userID string) (domain.CatalogSectionData, error) {
	return s.getCachedTopPicksForYou(userID, recommendations.TopPicksLimit), nil
}

func (s *animeService) fetchTopPicksForYou(ctx context.Context, userID string, limit int) (domain.CatalogSectionData, error) {
	return recommendations.GetTopPicksForYou(ctx, s.jikan, s.repo, userID, limit)
}

func (s *animeService) getCachedTopPicksForYou(userID string, limit int) domain.CatalogSectionData {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return domain.CatalogSectionData{
			Animes:              []domain.Anime{},
			RecommendationState: domain.RecommendationStateEmpty,
		}
	}

	key := topPicksCacheKey{userID: userID, limit: limit}
	now := time.Now()
	var refresh bool

	s.topPicksCache.mu.Lock()
	entry := s.topPicksCache.entries[key]
	if entry == nil {
		entry = &topPicksCacheEntry{refreshing: true}
		s.topPicksCache.entries[key] = entry
		refresh = true
	} else if !entry.refreshing {
		switch {
		case entry.failed && now.Before(entry.retryAt):
		case entry.failed || entry.stale || entryExpired(entry, now, s.topPicksCacheTTL) || !entry.hasResult:
			entry.refreshing = true
			entry.failed = false
			entry.retryAt = time.Time{}
			entry.stale = entry.hasResult && len(entry.data.Animes) > 0
			refresh = true
		}
	}
	data := topPicksSnapshot(entry, now)
	s.topPicksCache.mu.Unlock()

	if refresh {
		go s.refreshTopPicksForYou(key)
	}

	return data
}

func (s *animeService) refreshTopPicksForYou(key topPicksCacheKey) {
	ctx, cancel := context.WithTimeout(context.Background(), topPicksRefreshTimeout)
	defer cancel()

	startedAt := time.Now()
	observability.Info("top_picks_refresh_started", "anime", "", map[string]any{
		"user_id": key.userID,
		"limit":   key.limit,
	})

	data, err := s.computeTopPicks(ctx, key.userID, key.limit)
	now := time.Now()
	if err != nil {
		observability.WarnContext(ctx,
			"top_picks_refresh_failed",
			"anime",
			"",
			map[string]any{
				"user_id":     key.userID,
				"limit":       key.limit,
				"duration_ms": time.Since(startedAt).Milliseconds(),
				"retry_after": int(topPicksRetryDelay / time.Second),
			},
			err,
		)
		s.topPicksCache.mu.Lock()
		if entry := s.topPicksCache.entries[key]; entry != nil {
			entry.refreshing = false
			entry.failed = true
			entry.retryAt = now.Add(topPicksRetryDelay)
			entry.stale = entry.hasResult && len(entry.data.Animes) > 0
		}
		s.topPicksCache.mu.Unlock()
		return
	}

	s.topPicksCache.mu.Lock()
	s.topPicksCache.entries[key] = &topPicksCacheEntry{
		data:      cloneCatalogSectionData(data),
		updatedAt: now,
		hasResult: true,
	}
	s.topPicksCache.mu.Unlock()

	observability.Info("top_picks_refresh_completed", "anime", "", map[string]any{
		"user_id":     key.userID,
		"limit":       key.limit,
		"count":       len(data.Animes),
		"duration_ms": time.Since(startedAt).Milliseconds(),
	})
}

func (s *animeService) InvalidateTopPicksForUser(userID string) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}

	var refreshKeys []topPicksCacheKey
	s.topPicksCache.mu.Lock()
	matched := false
	for key, entry := range s.topPicksCache.entries {
		if key.userID == userID {
			matched = true
			entry.failed = false
			entry.retryAt = time.Time{}
			entry.stale = entry.hasResult && len(entry.data.Animes) > 0
			if !entry.refreshing {
				entry.refreshing = true
				refreshKeys = append(refreshKeys, key)
			}
		}
	}
	if !matched {
		key := topPicksCacheKey{userID: userID, limit: recommendations.TopPicksLimit}
		s.topPicksCache.entries[key] = &topPicksCacheEntry{refreshing: true}
		refreshKeys = append(refreshKeys, key)
	}
	s.topPicksCache.mu.Unlock()

	for _, key := range refreshKeys {
		go s.refreshTopPicksForYou(key)
	}
}

func entryExpired(entry *topPicksCacheEntry, now time.Time, ttl time.Duration) bool {
	return entry.hasResult && !entry.updatedAt.IsZero() && now.Sub(entry.updatedAt) >= ttl
}

func topPicksSnapshot(entry *topPicksCacheEntry, now time.Time) domain.CatalogSectionData {
	data := cloneCatalogSectionData(entry.data)
	if !entry.hasResult {
		data.Animes = []domain.Anime{}
	}

	data.RecommendationState = topPicksState(entry)
	if entry.failed && now.Before(entry.retryAt) {
		data.RetryAfterSeconds = retryAfterSeconds(now, entry.retryAt)
	}
	return data
}

func topPicksState(entry *topPicksCacheEntry) domain.RecommendationRefreshState {
	hasCards := entry.hasResult && len(entry.data.Animes) > 0
	switch {
	case entry.refreshing && hasCards:
		return domain.RecommendationStateStale
	case entry.refreshing:
		return domain.RecommendationStateRefreshing
	case entry.failed && hasCards:
		return domain.RecommendationStateStale
	case entry.failed:
		return domain.RecommendationStateFailed
	case hasCards:
		return domain.RecommendationStateReady
	default:
		return domain.RecommendationStateEmpty
	}
}

func retryAfterSeconds(now time.Time, retryAt time.Time) int {
	if !retryAt.After(now) {
		return 0
	}
	remaining := retryAt.Sub(now)
	seconds := int(remaining / time.Second)
	if remaining%time.Second != 0 {
		seconds++
	}
	if seconds < 1 {
		return 1
	}
	return seconds
}

func cloneCatalogSectionData(data domain.CatalogSectionData) domain.CatalogSectionData {
	data.Animes = append([]domain.Anime(nil), data.Animes...)
	data.ContinueWatching = append(data.ContinueWatching[:0:0], data.ContinueWatching...)
	if data.WatchlistMap != nil {
		watchlistMap := make(map[int64]bool, len(data.WatchlistMap))
		maps.Copy(watchlistMap, data.WatchlistMap)
		data.WatchlistMap = watchlistMap
	}
	return data
}
