package handler

import (
	"container/list"
	"sync"
	"time"
)

type subtitleCacheEntry struct {
	key         string
	data        []byte
	contentType string
	expiresAt   time.Time
}

// subtitleCache is a small TTL+LRU cache to avoid unbounded memory usage when
// proxying subtitles.
type subtitleCache struct {
	mu         sync.Mutex
	ttl        time.Duration
	maxEntries int

	entries map[string]*list.Element
	lru     *list.List
}

func newSubtitleCache(ttl time.Duration, maxEntries int) *subtitleCache {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	if maxEntries <= 0 {
		maxEntries = 256
	}
	return &subtitleCache{
		ttl:        ttl,
		maxEntries: maxEntries,
		entries:    make(map[string]*list.Element, maxEntries),
		lru:        list.New(),
	}
}

func (c *subtitleCache) Get(key string, now time.Time) (data []byte, contentType string, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	el := c.entries[key]
	if el == nil {
		return nil, "", false
	}
	entry, ok := el.Value.(subtitleCacheEntry)
	if !ok {
		c.removeElement(el)
		return nil, "", false
	}
	if !entry.expiresAt.IsZero() && now.After(entry.expiresAt) {
		c.removeElement(el)
		return nil, "", false
	}
	c.lru.MoveToFront(el)
	return entry.data, entry.contentType, true
}

func (c *subtitleCache) Set(key string, data []byte, contentType string, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if el := c.entries[key]; el != nil {
		entry, ok := el.Value.(subtitleCacheEntry)
		if !ok {
			c.removeElement(el)
			return
		}
		entry.data = data
		entry.contentType = contentType
		entry.expiresAt = now.Add(c.ttl)
		el.Value = entry
		c.lru.MoveToFront(el)
		return
	}

	entry := subtitleCacheEntry{
		key:         key,
		data:        data,
		contentType: contentType,
		expiresAt:   now.Add(c.ttl),
	}
	el := c.lru.PushFront(entry)
	c.entries[key] = el

	for len(c.entries) > c.maxEntries {
		back := c.lru.Back()
		if back == nil {
			break
		}
		c.removeElement(back)
	}
}

func (c *subtitleCache) removeElement(el *list.Element) {
	entry, ok := el.Value.(subtitleCacheEntry)
	if !ok {
		c.lru.Remove(el)
		return
	}
	delete(c.entries, entry.key)
	c.lru.Remove(el)
}
