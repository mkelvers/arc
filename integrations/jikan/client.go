package jikan

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
	"time"

	jcache "mal/integrations/jikan/cache"
	"mal/integrations/jikan/rate"
	jtransport "mal/integrations/jikan/transport"
	"mal/internal/config"
	"mal/internal/db"
	"mal/internal/observability"

	"golang.org/x/sync/singleflight"
)

var traceEnabled bool

type Client struct {
	baseURL     string
	db          db.Querier
	retrySignal chan struct{} // signals retry worker to process queued retries
	sf          singleflight.Group
	refreshSem  chan struct{}
	cache       *jcache.Store
	fetcher     *jtransport.Client

	// Random anime pool for DDoS-proof truly random "Surprise Me"
	randomPool      []Anime
	poolMu          sync.RWMutex
	poolInitialized bool
}

const jikanSlowLogThreshold = 750 * time.Millisecond

type APIError = jtransport.APIError

func NewClient(cfg config.Config, queries *db.Queries, metrics *observability.Metrics) *Client {
	traceEnabled = cfg.JikanTrace
	limiter := rate.NewLimiter(400 * time.Millisecond)
	return &Client{
		baseURL:     "https://api.jikan.moe/v4",
		db:          queries,
		retrySignal: make(chan struct{}, 1),
		refreshSem:  make(chan struct{}, 4),
		cache:       jcache.NewStore(queries, metrics),
		fetcher: jtransport.NewClient(jtransport.Config{
			HTTPClient:   jtransport.NewHTTPClient(),
			Limiter:      limiter,
			Metrics:      metrics,
			TraceEnabled: jikanTraceEnabled,
		}),
		randomPool: make([]Anime, 0),
	}
}

// IsRetryableError returns true if the error should trigger a retry.
func IsRetryableError(err error) bool {
	return jtransport.IsRetryableError(err)
}

func jikanTraceEnabled() bool {
	return traceEnabled
}

func shouldSkipJikanCacheLog(source string, duration time.Duration, err error) bool {
	if jikanTraceEnabled() || err != nil {
		return false
	}

	if source == "fresh" {
		return duration < 50*time.Millisecond
	}

	if source == "refresh" {
		return duration < jikanSlowLogThreshold
	}

	return false
}

func jikanCacheLogLevel(source string, err error) observability.LogLevel {
	if err != nil {
		return observability.LogLevelError
	}

	if source != "fresh" && source != "refresh" {
		// Stale reads are expected sometimes, but worth tracking in logs.
		return observability.LogLevelWarn
	}

	return observability.LogLevelInfo
}

func logJikanCache(cacheKey string, source string, startedAt time.Time, err error) {
	duration := time.Since(startedAt)
	if shouldSkipJikanCacheLog(source, duration, err) {
		return
	}

	observability.LogJSON(
		jikanCacheLogLevel(source, err),
		"jikan_cache",
		"jikan",
		"",
		map[string]any{
			"cache_key":   cacheKey,
			"source":      source,
			"duration_ms": float64(duration.Microseconds()) / 1000,
		},
		err,
	)
}

func truncateErrorMessage(message string) string {
	if len(message) <= 400 {
		return message
	}

	return message[:400]
}

// notifyRetryWorker signals the retry worker, non-blocking.
func (c *Client) notifyRetryWorker() {
	select {
	case c.retrySignal <- struct{}{}:
	default:
	}
}

// RetrySignal returns channel that signals when retries are enqueued.
func (c *Client) RetrySignal() <-chan struct{} {
	return c.retrySignal
}

// EnqueueAnimeFetchRetry queues a failed anime fetch for later retry if the error is retryable.
func (c *Client) EnqueueAnimeFetchRetry(parentCtx context.Context, animeID int, cause error) {
	if animeID <= 0 || !IsRetryableError(cause) {
		return
	}

	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()

	err := c.db.EnqueueAnimeFetchRetry(ctx, db.EnqueueAnimeFetchRetryParams{
		AnimeID:   int64(animeID),
		LastError: truncateErrorMessage(cause.Error()),
	})
	if err != nil {
		return
	}

	c.notifyRetryWorker()
}

func (c *Client) getCache(parentCtx context.Context, key string, out any) bool {
	return c.cache.Get(parentCtx, key, out)
}

func (c *Client) getStaleCache(parentCtx context.Context, key string, out any) bool {
	return c.cache.GetStale(parentCtx, key, out)
}

func (c *Client) setCache(parentCtx context.Context, key string, data any, ttl time.Duration) {
	c.cache.Set(parentCtx, key, data, ttl)
}

func (c *Client) fetchWithRetry(ctx context.Context, urlStr string, out any) error {
	return c.fetcher.FetchWithRetry(ctx, urlStr, out)
}

// isEmptyResult detects if response contains no meaningful data.
func isEmptyResult(out any) bool {
	switch v := out.(type) {
	case *TopAnimeResponse:
		return len(v.Data) == 0
	case *SearchResponse:
		return len(v.Data) == 0
	case *AnimeResponse:
		return v.Data.MalID == 0
	case *EpisodesResponse:
		return len(v.Data) == 0
	case *StaffResponse:
		return len(v.Data) == 0
	case *StatisticsResponse:
		return v.Data.Total == 0
	case *ThemesResponse:
		return len(v.Data.Openings) == 0 && len(v.Data.Endings) == 0
	case *ReviewsResponse:
		return false // empty reviews is a valid state
	}
	return false
}

func cloneResponseTarget(out any) (any, bool) {
	if out == nil {
		return nil, false
	}

	outType := reflect.TypeOf(out)
	if outType.Kind() != reflect.Pointer || outType.Elem() == nil {
		return nil, false
	}

	return reflect.New(outType.Elem()).Interface(), true
}

func (c *Client) refreshWithCache(ctx context.Context, cacheKey string, ttl time.Duration, url string, out any) error {
	value, err, _ := c.sf.Do("refresh:"+cacheKey, func() (any, error) {
		if c.getCache(ctx, cacheKey, out) {
			if !isEmptyResult(out) {
				return json.Marshal(out)
			}
		}

		if err := c.fetchWithRetry(ctx, url, out); err != nil {
			return nil, err
		}

		// Don't cache empty results to avoid caching failures.
		if isEmptyResult(out) {
			return nil, fmt.Errorf("jikan: empty response for %s", cacheKey)
		}

		c.setCache(ctx, cacheKey, out, ttl)
		return json.Marshal(out)
	})
	if err != nil {
		return err
	}

	if bytes, ok := value.([]byte); ok {
		if err := json.Unmarshal(bytes, out); err == nil && !isEmptyResult(out) {
			return nil
		}
	}

	return fmt.Errorf("jikan: empty response for %s", cacheKey)
}

func (c *Client) refreshWithCacheAsync(cacheKey string, ttl time.Duration, url string, out any) {
	target, ok := cloneResponseTarget(out)
	if !ok {
		return
	}

	c.runAsyncRefresh(func(ctx context.Context) {
		_ = c.refreshWithCache(ctx, cacheKey, ttl, url, target)
	})
}

func (c *Client) runAsyncRefresh(refresh func(context.Context)) {
	select {
	case c.refreshSem <- struct{}{}:
	default:
		return
	}

	go func() {
		defer func() { <-c.refreshSem }()

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		refresh(ctx)
	}()
}

// getWithCache fetches URL with a stale-while-revalidate DB cache strategy.
func (c *Client) getWithCache(ctx context.Context, cacheKey string, ttl time.Duration, url string, out any) error {
	startedAt := time.Now()
	if c.getCache(ctx, cacheKey, out) {
		if !isEmptyResult(out) {
			logJikanCache(cacheKey, "fresh", startedAt, nil)
			return nil
		}
	}

	if c.getStaleCache(ctx, cacheKey, out) && !isEmptyResult(out) {
		logJikanCache(cacheKey, "stale", startedAt, nil)
		c.refreshWithCacheAsync(cacheKey, ttl, url, out)
		return nil
	}

	if err := c.refreshWithCache(ctx, cacheKey, ttl, url, out); err != nil {
		if c.getStaleCache(ctx, cacheKey, out) && !isEmptyResult(out) {
			logJikanCache(cacheKey, "stale_after_error", startedAt, err)
			return nil
		}
		logJikanCache(cacheKey, "miss", startedAt, err)
		return err
	}

	logJikanCache(cacheKey, "refresh", startedAt, nil)
	return nil
}
