package handler

import (
	"container/list"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	manifestCacheVODTTL      = 45 * time.Second
	manifestCacheLiveTTL     = 3 * time.Second
	manifestCacheMaxEntries  = 256
	manifestCacheMaxBodySize = 2 << 20
)

type manifestCacheEntry struct {
	key       string
	body      []byte
	headers   http.Header
	status    int
	expiresAt time.Time
}

type manifestCache struct {
	mu         sync.Mutex
	maxEntries int
	entries    map[string]*list.Element
	lru        *list.List
}

func newManifestCache(maxEntries int) *manifestCache {
	if maxEntries <= 0 {
		maxEntries = manifestCacheMaxEntries
	}
	return &manifestCache{
		maxEntries: maxEntries,
		entries:    make(map[string]*list.Element, maxEntries),
		lru:        list.New(),
	}
}

func manifestCacheKey(targetURL string, referer string) string {
	return targetURL + "\x00" + referer
}

func (c *manifestCache) get(key string, now time.Time) (manifestCacheEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	el := c.entries[key]
	if el == nil {
		return manifestCacheEntry{}, false
	}
	entry, ok := el.Value.(manifestCacheEntry)
	if !ok || !now.Before(entry.expiresAt) {
		c.remove(el)
		return manifestCacheEntry{}, false
	}
	c.lru.MoveToFront(el)
	entry.body = append([]byte(nil), entry.body...)
	entry.headers = entry.headers.Clone()
	return entry, true
}

func (c *manifestCache) set(key string, status int, headers http.Header, body []byte, now time.Time) bool {
	if status < http.StatusOK || status >= http.StatusMultipleChoices || len(body) > manifestCacheMaxBodySize {
		return false
	}

	ttl := manifestCacheVODTTL
	bodyText := string(body)
	if strings.Contains(bodyText, "#EXTINF") && !strings.Contains(bodyText, "#EXT-X-ENDLIST") {
		ttl = manifestCacheLiveTTL
	}
	entry := manifestCacheEntry{
		key:       key,
		body:      append([]byte(nil), body...),
		headers:   headers.Clone(),
		status:    status,
		expiresAt: now.Add(ttl),
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if el := c.entries[key]; el != nil {
		el.Value = entry
		c.lru.MoveToFront(el)
		return true
	}
	c.entries[key] = c.lru.PushFront(entry)
	for len(c.entries) > c.maxEntries {
		back := c.lru.Back()
		if back == nil {
			break
		}
		c.remove(back)
	}
	return true
}

func (c *manifestCache) remove(el *list.Element) {
	entry, ok := el.Value.(manifestCacheEntry)
	if ok {
		delete(c.entries, entry.key)
	}
	c.lru.Remove(el)
}
