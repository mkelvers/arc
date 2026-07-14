package watchorder

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"mal/internal/domain"
)

const (
	watchOrderFreshTTL = 30 * 24 * time.Hour
	watchOrderStaleTTL = 7 * 24 * time.Hour
)

type CachedClient struct {
	baseURL    string
	httpClient *http.Client
	cache      domain.CacheStore
}

func NewCachedClient(baseURL string, httpClient *http.Client, cache domain.CacheStore) *CachedClient {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &CachedClient{baseURL: baseURL, httpClient: httpClient, cache: cache}
}

func (c *CachedClient) FetchByAnimeID(ctx context.Context, malID int) (WatchOrderResult, error) {
	key := fmt.Sprintf("chiaki:watch-order:mal:%d", malID)
	var cached WatchOrderResult
	result, _ := c.cache.Get(ctx, key, &cached)
	if result.State == domain.CacheFresh {
		return cached, nil
	}

	url := fmt.Sprintf("%s/?/tools/watch_order/id/%d", c.baseURL, malID)
	fetched, fetchErr := FetchWatchOrder(ctx, c.httpClient, url)
	if fetchErr == nil {
		_ = c.cache.Set(ctx, key, fetched, watchOrderFreshTTL, watchOrderStaleTTL)
		return fetched, nil
	}
	if result.State == domain.CacheStale {
		return cached, nil
	}
	return WatchOrderResult{}, fetchErr
}
