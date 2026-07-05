package anime

import (
	"context"
	"mal/internal/anime/recommendations"
	"mal/internal/domain"
	"mal/internal/observability"
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
	hasData    bool
	refreshing bool
}

type topPicksCache struct {
	mu      sync.Mutex
	entries map[topPicksCacheKey]*topPicksCacheEntry
}

const topPicksRefreshTimeout = 30 * time.Second

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
		return domain.CatalogSectionData{Animes: []domain.Anime{}}
	}

	key := topPicksCacheKey{userID: userID, limit: limit}
	now := time.Now()

	s.topPicksCache.mu.Lock()
	entry := s.topPicksCache.entries[key]
	if entry != nil && entry.hasData {
		data := cloneCatalogSectionData(entry.data)
		if now.Sub(entry.updatedAt) >= s.topPicksCacheTTL && !entry.refreshing {
			entry.refreshing = true
			go s.refreshTopPicksForYou(key)
		}
		s.topPicksCache.mu.Unlock()
		return data
	}

	if entry == nil {
		entry = &topPicksCacheEntry{}
		s.topPicksCache.entries[key] = entry
	}
	if !entry.refreshing {
		entry.refreshing = true
		go s.refreshTopPicksForYou(key)
	}
	s.topPicksCache.mu.Unlock()

	return domain.CatalogSectionData{Animes: []domain.Anime{}}
}

func (s *animeService) refreshTopPicksForYou(key topPicksCacheKey) {
	ctx, cancel := context.WithTimeout(context.Background(), topPicksRefreshTimeout)
	defer cancel()

	data, err := s.computeTopPicks(ctx, key.userID, key.limit)
	if err != nil {
		observability.WarnContext(ctx,
			"top_picks_refresh_failed",
			"anime",
			"",
			map[string]any{"user_id": key.userID, "limit": key.limit},
			err,
		)
		s.topPicksCache.mu.Lock()
		if entry := s.topPicksCache.entries[key]; entry != nil {
			entry.refreshing = false
		}
		s.topPicksCache.mu.Unlock()
		return
	}

	s.topPicksCache.mu.Lock()
	s.topPicksCache.entries[key] = &topPicksCacheEntry{
		data:      cloneCatalogSectionData(data),
		updatedAt: time.Now(),
		hasData:   true,
	}
	s.topPicksCache.mu.Unlock()
}

func (s *animeService) InvalidateTopPicksForUser(userID string) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}

	s.topPicksCache.mu.Lock()
	defer s.topPicksCache.mu.Unlock()
	for key := range s.topPicksCache.entries {
		if key.userID == userID {
			delete(s.topPicksCache.entries, key)
		}
	}
}

func cloneCatalogSectionData(data domain.CatalogSectionData) domain.CatalogSectionData {
	data.Animes = append([]domain.Anime(nil), data.Animes...)
	data.ContinueWatching = append(data.ContinueWatching[:0:0], data.ContinueWatching...)
	if data.WatchlistMap != nil {
		watchlistMap := make(map[int64]bool, len(data.WatchlistMap))
		for id, ok := range data.WatchlistMap {
			watchlistMap[id] = ok
		}
		data.WatchlistMap = watchlistMap
	}
	return data
}
