package jikan

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sync"
	"time"

	jcache "mal/integrations/jikan/cache"
	"mal/integrations/jikan/rate"
	jtransport "mal/integrations/jikan/transport"
	"mal/internal/config"
	"mal/internal/database/db"
	"mal/internal/observability"

	"golang.org/x/sync/singleflight"
)

type Client struct {
	baseURL      string
	db           db.Querier
	retrySignal  chan struct{} // signals retry worker to process queued retries
	sf           singleflight.Group
	refreshSem   chan struct{}
	cache        *jcache.Store
	fetcher      *jtransport.Client
	traceEnabled bool

	// Random anime pool for DDoS-proof truly random "Surprise Me"
	randomPool      []Anime
	poolMu          sync.RWMutex
	poolInitialized bool
}

const jikanSlowLogThreshold = 750 * time.Millisecond

type APIError = jtransport.APIError

func NewClient(cfg config.Config, queries *db.Queries) *Client {
	limiter := rate.NewLimiter(400 * time.Millisecond)
	client := &Client{
		baseURL:      "https://api.jikan.moe/v4",
		db:           queries,
		retrySignal:  make(chan struct{}, 1),
		refreshSem:   make(chan struct{}, 4),
		cache:        jcache.NewStore(queries),
		traceEnabled: cfg.JikanTrace,
		randomPool:   make([]Anime, 0),
	}
	client.fetcher = jtransport.NewClient(jtransport.Config{
		HTTPClient:   jtransport.NewHTTPClient(),
		Limiter:      limiter,
		TraceEnabled: client.jikanTraceEnabled,
	})

	return client
}

// IsRetryableError returns true if the error should trigger a retry.
func IsRetryableError(err error) bool {
	return jtransport.IsRetryableError(err)
}

func (c *Client) jikanTraceEnabled() bool {
	return c.traceEnabled
}

func (c *Client) shouldSkipJikanCacheLog(source string, duration time.Duration, err error) bool {
	if c.jikanTraceEnabled() || err != nil {
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

func (c *Client) logJikanCache(cacheKey string, source string, startedAt time.Time, err error) {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return
	}

	duration := time.Since(startedAt)
	if c.shouldSkipJikanCacheLog(source, duration, err) {
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

	message := cause.Error()
	if len(message) > 400 {
		message = message[:400]
	}

	err := c.db.EnqueueAnimeFetchRetry(ctx, db.EnqueueAnimeFetchRetryParams{
		AnimeID:   int64(animeID),
		LastError: message,
	})
	if err != nil {
		observability.Warn(
			"jikan_retry_enqueue_failed",
			"jikan",
			"",
			map[string]any{"anime_id": animeID},
			err,
		)
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

var emptyResultChecks = map[reflect.Type]func(any) bool{
	reflect.TypeFor[*TopAnimeResponse](): func(out any) bool {
		return len(out.(*TopAnimeResponse).Data) == 0
	},
	reflect.TypeFor[*AnimeResponse](): func(out any) bool {
		return out.(*AnimeResponse).Data.MalID == 0
	},
	reflect.TypeFor[*EpisodesResponse](): func(out any) bool {
		return len(out.(*EpisodesResponse).Data) == 0
	},
	reflect.TypeFor[*StaffResponse](): func(out any) bool {
		return len(out.(*StaffResponse).Data) == 0
	},
	reflect.TypeFor[*StatisticsResponse](): func(out any) bool {
		return out.(*StatisticsResponse).Data.Total == 0
	},
	reflect.TypeFor[*ThemesResponse](): func(out any) bool {
		themes := out.(*ThemesResponse).Data
		return len(themes.Openings) == 0 && len(themes.Endings) == 0
	},
}

// isEmptyResult detects if response contains no meaningful data.
func isEmptyResult(out any) bool {
	if out == nil {
		return true
	}

	outType := reflect.TypeOf(out)
	if check, ok := emptyResultChecks[outType]; ok {
		return check(out)
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
	value, err, shared := c.sf.Do("refresh:"+cacheKey, func() (any, error) {
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
	if shared {
		observability.Info(
			"jikan_cache_refresh_shared",
			"jikan",
			"",
			map[string]any{"cache_key": cacheKey, "url": url},
		)
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
		if err := c.refreshWithCache(ctx, cacheKey, ttl, url, target); err != nil {
			observability.Warn(
				"jikan_async_cache_refresh_failed",
				"jikan",
				"",
				map[string]any{"cache_key": cacheKey, "url": url},
				err,
			)
		}
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
			c.logJikanCache(cacheKey, "fresh", startedAt, nil)
			return nil
		}
	}

	if c.getStaleCache(ctx, cacheKey, out) && !isEmptyResult(out) {
		c.logJikanCache(cacheKey, "stale", startedAt, nil)
		c.refreshWithCacheAsync(cacheKey, ttl, url, out)
		return nil
	}

	if err := c.refreshWithCache(ctx, cacheKey, ttl, url, out); err != nil {
		if c.getStaleCache(ctx, cacheKey, out) && !isEmptyResult(out) {
			c.logJikanCache(cacheKey, "stale_after_error", startedAt, err)
			return nil
		}
		c.logJikanCache(cacheKey, "miss", startedAt, err)
		return err
	}

	c.logJikanCache(cacheKey, "refresh", startedAt, nil)
	return nil
}
