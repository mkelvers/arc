package anilist

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"mal/internal/domain"
)

const (
	metadataFreshTTL    = 30 * 24 * time.Hour
	metadataStaleTTL    = 7 * 24 * time.Hour
	genreFreshTTL       = 7 * 24 * time.Hour
	searchFreshTTL      = 24 * time.Hour
	catalogFreshTTL     = time.Hour
	recommendFreshTTL   = 7 * 24 * time.Hour
	detailCacheKeyV3    = "v3"
	catalogCacheKeyV2   = "v2"
	summaryCacheKeyV2   = "v2"
	recommendCacheKeyV2 = "v2"
)

type CachedClient struct {
	client *Client
	cache  domain.CacheStore
}

func NewCachedClient(client *Client, cache domain.CacheStore) *CachedClient {
	return &CachedClient{client: client, cache: cache}
}

func (c *CachedClient) GetAnimeByMALID(ctx context.Context, id int) (Anime, error) {
	key := fmt.Sprintf("anilist:anime:mal:detail:%s:%d", detailCacheKeyV3, id)
	var cached Anime
	result, _ := c.cache.Get(ctx, key, &cached)
	if result.State == domain.CacheFresh {
		return cached, nil
	}

	fetched, fetchErr := c.client.GetAnimeByMALID(ctx, id)
	if fetchErr == nil {
		_ = c.cache.Set(ctx, key, fetched, metadataFreshTTL, metadataStaleTTL)
		return fetched, nil
	}
	if result.State == domain.CacheStale {
		return cached, nil
	}
	return Anime{}, fetchErr
}

func (c *CachedClient) GetGenres(ctx context.Context) ([]string, error) {
	key := "anilist:genres"
	var cached []string
	result, _ := c.cache.Get(ctx, key, &cached)
	if result.State == domain.CacheFresh {
		return cached, nil
	}

	fetched, err := c.client.GetGenres(ctx)
	if err == nil {
		_ = c.cache.Set(ctx, key, fetched, genreFreshTTL, metadataStaleTTL)
		return fetched, nil
	}
	if result.State == domain.CacheStale {
		return cached, nil
	}
	return nil, err
}

func (c *CachedClient) GetAnimeBatchByMALID(ctx context.Context, ids []int) ([]Anime, error) {
	ids = uniquePositive(ids)
	if len(ids) == 0 {
		return nil, nil
	}

	fresh, stale, missing := c.readBatchCache(ctx, ids)
	fetched, err := c.fetchBatch(ctx, missing, stale)
	if err != nil {
		return nil, err
	}
	return mergeBatchResults(ids, fresh, fetched, stale), nil
}

func (c *CachedClient) readBatchCache(ctx context.Context, ids []int) (map[int]Anime, map[int]Anime, []int) {
	fresh := make(map[int]Anime, len(ids))
	stale := make(map[int]Anime, len(ids))
	missing := make([]int, 0, len(ids))
	for _, id := range ids {
		var cached Anime
		result, _ := c.cache.Get(ctx, fmt.Sprintf("anilist:anime:mal:summary:%s:%d", summaryCacheKeyV2, id), &cached)
		switch result.State {
		case domain.CacheFresh:
			fresh[id] = cached
		case domain.CacheStale:
			stale[id] = cached
			missing = append(missing, id)
		default:
			missing = append(missing, id)
		}
	}
	return fresh, stale, missing
}

func (c *CachedClient) fetchBatch(ctx context.Context, missing []int, stale map[int]Anime) (map[int]Anime, error) {
	fetched := make(map[int]Anime, len(missing))
	if len(missing) == 0 {
		return fetched, nil
	}
	items, err := c.client.GetAnimeBatchByMALID(ctx, missing)
	if err != nil {
		for _, id := range missing {
			if _, ok := stale[id]; !ok {
				return nil, err
			}
		}
		return fetched, nil
	}
	for _, item := range items {
		fetched[item.MALID] = item
		_ = c.cache.Set(ctx, fmt.Sprintf("anilist:anime:mal:summary:%s:%d", summaryCacheKeyV2, item.MALID), item, metadataFreshTTL, metadataStaleTTL)
	}
	return fetched, nil
}

func mergeBatchResults(ids []int, fresh, fetched, stale map[int]Anime) []Anime {
	items := make([]Anime, 0, len(ids))
	for _, id := range ids {
		item, ok := fresh[id]
		if !ok {
			item, ok = fetched[id]
		}
		if !ok {
			item, ok = stale[id]
		}
		if ok {
			items = append(items, item)
		}
	}
	return items
}

func (c *CachedClient) Search(ctx context.Context, search string, page, perPage int) (SearchResult, error) {
	key := fmt.Sprintf("anilist:search:%s:%d:%d", url.QueryEscape(search), page, perPage)
	var cached SearchResult
	result, _ := c.cache.Get(ctx, key, &cached)
	if result.State == domain.CacheFresh {
		return cached, nil
	}
	fetched, err := c.client.Search(ctx, search, page, perPage)
	if err == nil {
		_ = c.cache.Set(ctx, key, fetched, searchFreshTTL, metadataStaleTTL)
		return fetched, nil
	}
	if result.State == domain.CacheStale {
		return cached, nil
	}
	return SearchResult{}, err
}

func (c *CachedClient) SearchAdvanced(ctx context.Context, opts domain.SearchOptions) (SearchResult, error) {
	key := advancedSearchCacheKey(opts)
	var cached SearchResult
	result, _ := c.cache.Get(ctx, key, &cached)
	if result.State == domain.CacheFresh {
		return cached, nil
	}
	fetched, err := c.client.SearchAdvanced(ctx, opts)
	if err == nil {
		_ = c.cache.Set(ctx, key, fetched, searchFreshTTL, metadataStaleTTL)
		return fetched, nil
	}
	if result.State == domain.CacheStale {
		return cached, nil
	}
	return SearchResult{}, err
}

func advancedSearchCacheKey(opts domain.SearchOptions) string {
	return fmt.Sprintf(
		"anilist:search-advanced:%s:%s:%s:%s:%s:%v:%d:%t:%d:%d",
		url.QueryEscape(opts.Query),
		opts.AnimeType,
		opts.Status,
		opts.OrderBy,
		opts.Sort,
		opts.Genres,
		opts.StudioID,
		opts.SFW,
		opts.Page,
		opts.Limit,
	)
}

func (c *CachedClient) GetPopular(ctx context.Context, page, perPage int) (CatalogResult, error) {
	return c.getCatalog(ctx, fmt.Sprintf("anilist:catalog:%s:popular:%d:%d", catalogCacheKeyV2, page, perPage), func() (CatalogResult, error) {
		return c.client.GetPopular(ctx, page, perPage)
	})
}

func (c *CachedClient) GetSeason(ctx context.Context, opts SeasonOptions) (CatalogResult, error) {
	return c.getCatalog(ctx, fmt.Sprintf("anilist:catalog:%s:season:%s:%d:%d:%d", catalogCacheKeyV2, opts.Season, opts.Year, opts.Page, opts.PerPage), func() (CatalogResult, error) {
		return c.client.GetSeason(ctx, opts)
	})
}

func (c *CachedClient) GetRecommendations(ctx context.Context, id int) ([]Recommendation, error) {
	key := fmt.Sprintf("anilist:recommendations:mal:%s:%d", recommendCacheKeyV2, id)
	var cached []Recommendation
	result, _ := c.cache.Get(ctx, key, &cached)
	if result.State == domain.CacheFresh {
		return cached, nil
	}
	fetched, err := c.client.GetRecommendations(ctx, id)
	if err == nil {
		_ = c.cache.Set(ctx, key, fetched, recommendFreshTTL, metadataStaleTTL)
		return fetched, nil
	}
	if result.State == domain.CacheStale {
		return cached, nil
	}
	return nil, err
}

func (c *CachedClient) getCatalog(ctx context.Context, key string, fetch func() (CatalogResult, error)) (CatalogResult, error) {
	var cached CatalogResult
	result, _ := c.cache.Get(ctx, key, &cached)
	if result.State == domain.CacheFresh {
		return cached, nil
	}
	fetched, err := fetch()
	if err == nil {
		_ = c.cache.Set(ctx, key, fetched, catalogFreshTTL, metadataStaleTTL)
		return fetched, nil
	}
	if result.State == domain.CacheStale {
		return cached, nil
	}
	return CatalogResult{}, err
}
