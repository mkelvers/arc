package playback

import (
	"container/list"
	"fmt"
	"strings"
	"sync"
	"time"

	"mal/internal/domain"
)

const (
	defaultSourceCacheTTL        = 5 * time.Minute
	defaultSourceCacheStaleTTL   = 10 * time.Minute
	defaultSourceCacheMaxEntries = 512
)

type sourceCacheKey struct {
	animeID int
	episode string
	mode    string
}

func newSourceCacheKey(animeID int, episode string, mode string) sourceCacheKey {
	return sourceCacheKey{
		animeID: animeID,
		episode: strings.TrimSpace(episode),
		mode:    normalizeSourceMode(mode),
	}
}

func (k sourceCacheKey) flightKey() string {
	return fmt.Sprintf("%d|%q|%q", k.animeID, k.episode, k.mode)
}

func normalizeSourceMode(mode string) string {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "" {
		return "sub"
	}
	return mode
}

type sourceCacheEntry struct {
	key        sourceCacheKey
	result     *domain.StreamResult
	freshUntil time.Time
	staleUntil time.Time
}

type sourceCacheState uint8

const (
	sourceCacheMiss sourceCacheState = iota
	sourceCacheFresh
	sourceCacheStale
)

type sourceCache struct {
	mu         sync.Mutex
	freshTTL   time.Duration
	staleTTL   time.Duration
	maxEntries int
	entries    map[sourceCacheKey]*list.Element
	lru        *list.List
}

func newSourceCache(freshTTL, staleTTL time.Duration, maxEntries int) *sourceCache {
	if freshTTL <= 0 {
		freshTTL = defaultSourceCacheTTL
	}
	if staleTTL < 0 {
		staleTTL = 0
	}
	if maxEntries <= 0 {
		maxEntries = defaultSourceCacheMaxEntries
	}
	return &sourceCache{
		freshTTL:   freshTTL,
		staleTTL:   staleTTL,
		maxEntries: maxEntries,
		entries:    make(map[sourceCacheKey]*list.Element, maxEntries),
		lru:        list.New(),
	}
}

func (c *sourceCache) get(key sourceCacheKey, now time.Time) (*domain.StreamResult, sourceCacheState) {
	c.mu.Lock()
	defer c.mu.Unlock()

	el := c.entries[key]
	if el == nil {
		return nil, sourceCacheMiss
	}
	entry, ok := el.Value.(sourceCacheEntry)
	if !ok || !now.Before(entry.staleUntil) {
		c.remove(el)
		return nil, sourceCacheMiss
	}
	c.lru.MoveToFront(el)
	if now.Before(entry.freshUntil) {
		return cloneStreamResult(entry.result), sourceCacheFresh
	}
	return cloneStreamResult(entry.result), sourceCacheStale
}

func (c *sourceCache) set(key sourceCacheKey, result *domain.StreamResult, now time.Time) (evicted bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry := sourceCacheEntry{
		key:        key,
		result:     cloneStreamResult(result),
		freshUntil: now.Add(c.freshTTL),
		staleUntil: now.Add(c.freshTTL + c.staleTTL),
	}
	if el := c.entries[key]; el != nil {
		el.Value = entry
		c.lru.MoveToFront(el)
		return false
	}

	c.entries[key] = c.lru.PushFront(entry)
	for len(c.entries) > c.maxEntries {
		back := c.lru.Back()
		if back == nil {
			break
		}
		c.remove(back)
		evicted = true
	}
	return evicted
}

func (c *sourceCache) remove(el *list.Element) {
	entry, ok := el.Value.(sourceCacheEntry)
	if ok {
		delete(c.entries, entry.key)
	}
	c.lru.Remove(el)
}

func cloneStreamResult(result *domain.StreamResult) *domain.StreamResult {
	if result == nil {
		return nil
	}
	cloned := *result
	cloned.Subtitles = append([]domain.Subtitle(nil), result.Subtitles...)
	cloned.Qualities = append([]domain.StreamSource(nil), result.Qualities...)
	return &cloned
}
