package anime

import (
	"context"
	"fmt"
	"mal/integrations/playback/allanime"
	"mal/internal/observability"
	"slices"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	seasonalCacheFreshTTL      = 30 * time.Minute
	seasonalCacheStaleWindow   = 6 * time.Hour
	seasonalCacheEmptyNextTTL  = 10 * time.Minute
	seasonalCacheMaxEntries    = 40
	seasonalCacheRefreshWindow = 20 * time.Second
)

type seasonalFetchOptions struct {
	source        string
	emptyFreshTTL time.Duration
}

type seasonalCacheKey struct {
	season string
	year   int
}

func newSeasonalCacheKey(season string, year int) (seasonalCacheKey, error) {
	normalized := normalizeSeasonName(season)
	if normalized == "" {
		return seasonalCacheKey{}, fmt.Errorf("simulcast: invalid season %q", season)
	}
	if year <= 0 {
		return seasonalCacheKey{}, fmt.Errorf("simulcast: invalid season year %d", year)
	}
	return seasonalCacheKey{season: normalized, year: year}, nil
}

func normalizeSeasonName(season string) string {
	season = strings.ToLower(strings.TrimSpace(season))
	if slices.Contains(seasons, season) {
		return season
	}
	return ""
}

func (k seasonalCacheKey) String() string {
	return fmt.Sprintf("%s|%d", k.season, k.year)
}

type seasonalCacheState int

const (
	seasonalCacheMiss seasonalCacheState = iota
	seasonalCacheHit
	seasonalCacheStaleHit
)

type seasonalCacheRead struct {
	shows   []allanime.ProviderShow
	state   seasonalCacheState
	refresh bool
}

type seasonalCacheEntry struct {
	shows      []allanime.ProviderShow
	freshUntil time.Time
	staleUntil time.Time
	lastAccess time.Time
	refreshing bool
}

type seasonalCache struct {
	mu         sync.Mutex
	requests   singleflight.Group
	maxEntries int
	entries    map[seasonalCacheKey]*seasonalCacheEntry
}

func newSeasonalCache(maxEntries int) *seasonalCache {
	return &seasonalCache{
		maxEntries: maxEntries,
		entries:    map[seasonalCacheKey]*seasonalCacheEntry{},
	}
}

func (c *seasonalCache) read(key seasonalCacheKey, now time.Time) seasonalCacheRead {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry := c.entries[key]
	if entry == nil {
		return seasonalCacheRead{state: seasonalCacheMiss}
	}

	entry.lastAccess = now
	if now.Before(entry.freshUntil) {
		return seasonalCacheRead{
			shows: cloneProviderShows(entry.shows),
			state: seasonalCacheHit,
		}
	}

	if now.Before(entry.staleUntil) {
		refresh := !entry.refreshing
		entry.refreshing = true
		return seasonalCacheRead{
			shows:   cloneProviderShows(entry.shows),
			state:   seasonalCacheStaleHit,
			refresh: refresh,
		}
	}

	return seasonalCacheRead{state: seasonalCacheMiss}
}

func (c *seasonalCache) readStale(key seasonalCacheKey, now time.Time) ([]allanime.ProviderShow, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry := c.entries[key]
	if entry == nil || !now.Before(entry.staleUntil) {
		return nil, false
	}
	entry.lastAccess = now
	return cloneProviderShows(entry.shows), true
}

func (c *seasonalCache) set(key seasonalCacheKey, shows []allanime.ProviderShow, now time.Time, freshTTL time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[key] = &seasonalCacheEntry{
		shows:      cloneProviderShows(shows),
		freshUntil: now.Add(freshTTL),
		staleUntil: now.Add(freshTTL + seasonalCacheStaleWindow),
		lastAccess: now,
	}
	c.pruneLocked(key)
}

func (c *seasonalCache) finishRefresh(key seasonalCacheKey) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if entry := c.entries[key]; entry != nil {
		entry.refreshing = false
	}
}

func (c *seasonalCache) pruneLocked(keep seasonalCacheKey) {
	for c.maxEntries > 0 && len(c.entries) > c.maxEntries {
		oldestKey, ok := c.oldestKeyLocked(keep, false)
		if !ok {
			oldestKey, ok = c.oldestKeyLocked(keep, true)
		}
		if !ok {
			return
		}
		delete(c.entries, oldestKey)
	}
}

func (c *seasonalCache) oldestKeyLocked(keep seasonalCacheKey, includeRefreshing bool) (seasonalCacheKey, bool) {
	var oldestKey seasonalCacheKey
	var oldestAccess time.Time
	found := false
	for key, entry := range c.entries {
		if key == keep || entry == nil || entry.refreshing && !includeRefreshing {
			continue
		}
		if !found || entry.lastAccess.Before(oldestAccess) {
			oldestKey = key
			oldestAccess = entry.lastAccess
			found = true
		}
	}
	return oldestKey, found
}

func (s *SeasonDiscoveryService) cachedSeasonalShows(ctx context.Context, selected animeSeason, opts seasonalFetchOptions) ([]allanime.ProviderShow, error) {
	key, err := newSeasonalCacheKey(selected.Season, selected.Year)
	if err != nil {
		return nil, err
	}
	opts = normalizeSeasonalFetchOptions(opts)

	startedAt := time.Now()
	read := s.seasonalCache.read(key, s.currentTime())
	switch read.state {
	case seasonalCacheHit:
		logSeasonalCache(ctx, "simulcast_season_cache_hit", key, opts, startedAt, map[string]any{
			"count": len(read.shows),
		}, nil)
		return read.shows, nil
	case seasonalCacheStaleHit:
		logSeasonalCache(ctx, "simulcast_season_cache_stale_hit", key, opts, startedAt, map[string]any{
			"count": len(read.shows),
		}, nil)
		if read.refresh {
			go s.refreshCachedSeason(key, opts)
		}
		return read.shows, nil
	default:
		logSeasonalCache(ctx, "simulcast_season_cache_miss", key, opts, startedAt, nil, nil)
		return s.fetchCachedSeason(ctx, key, opts)
	}
}

func normalizeSeasonalFetchOptions(opts seasonalFetchOptions) seasonalFetchOptions {
	if opts.source == "" {
		opts.source = "simulcast"
	}
	if opts.emptyFreshTTL <= 0 {
		opts.emptyFreshTTL = seasonalCacheFreshTTL
	}
	return opts
}

func (s *SeasonDiscoveryService) refreshCachedSeason(key seasonalCacheKey, opts seasonalFetchOptions) {
	ctx, cancel := context.WithTimeout(context.Background(), seasonalCacheRefreshWindow)
	defer cancel()
	defer s.seasonalCache.finishRefresh(key)

	_, _ = s.fetchCachedSeason(ctx, key, opts)
}

func (s *SeasonDiscoveryService) fetchCachedSeason(ctx context.Context, key seasonalCacheKey, opts seasonalFetchOptions) ([]allanime.ProviderShow, error) {
	startedAt := time.Now()
	value, err, shared := s.seasonalCache.requests.Do(key.String(), func() (any, error) {
		shows, err := s.provider.SeasonalShows(ctx, key.season, key.year)
		if err != nil {
			if stale, ok := s.seasonalCache.readStale(key, s.currentTime()); ok {
				logSeasonalCache(ctx, "simulcast_season_cache_provider_error", key, opts, startedAt, map[string]any{
					"served_stale": true,
					"count":        len(stale),
				}, err)
				return stale, nil
			}
			logSeasonalCache(ctx, "simulcast_season_cache_provider_error", key, opts, startedAt, map[string]any{
				"served_stale": false,
			}, err)
			return nil, err
		}

		freshTTL := seasonalCacheFreshTTL
		if len(shows) == 0 {
			freshTTL = opts.emptyFreshTTL
		}
		s.seasonalCache.set(key, shows, s.currentTime(), freshTTL)
		if len(shows) == 0 && opts.emptyFreshTTL == seasonalCacheEmptyNextTTL {
			logSeasonalCache(ctx, "simulcast_season_cache_empty_next", key, opts, startedAt, map[string]any{
				"ttl_seconds": int(freshTTL / time.Second),
			}, nil)
		}
		logSeasonalCache(ctx, "simulcast_season_cache_refresh_completed", key, opts, startedAt, map[string]any{
			"count":             len(shows),
			"fresh_ttl_seconds": int(freshTTL / time.Second),
		}, nil)
		return cloneProviderShows(shows), nil
	})
	if shared {
		logSeasonalCache(ctx, "simulcast_season_cache_shared_fetch", key, opts, startedAt, nil, nil)
	}
	if err != nil {
		return nil, err
	}

	shows, ok := value.([]allanime.ProviderShow)
	if !ok {
		return nil, fmt.Errorf("simulcast: unexpected cached season value %T", value)
	}
	return cloneProviderShows(shows), nil
}

func logSeasonalCache(ctx context.Context, event string, key seasonalCacheKey, opts seasonalFetchOptions, startedAt time.Time, fields map[string]any, err error) {
	if fields == nil {
		fields = map[string]any{}
	}
	fields["season"] = key.season
	fields["year"] = key.year
	fields["lookup"] = opts.source
	fields["duration_ms"] = time.Since(startedAt).Milliseconds()

	level := observability.LogLevelInfo
	if err != nil {
		level = observability.LogLevelWarn
	}
	observability.LogContext(ctx, level, event, "anime", "", fields, err)
}

func cloneProviderShows(in []allanime.ProviderShow) []allanime.ProviderShow {
	out := append([]allanime.ProviderShow(nil), in...)
	for i := range out {
		out[i].SubEpisodes = append([]int(nil), out[i].SubEpisodes...)
		out[i].DubEpisodes = append([]int(nil), out[i].DubEpisodes...)
	}
	return out
}
