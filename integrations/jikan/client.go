package jikan

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"

	"mal/internal/db"

	"golang.org/x/sync/singleflight"
)

type Client struct {
	httpClient  *http.Client
	baseURL     string
	db          db.Querier
	retrySignal chan struct{} // signals retry worker to process queued retries
	mu          sync.Mutex
	lastReqTime time.Time // rate limiting: last request timestamp
	sf          singleflight.Group
	refreshSem  chan struct{}

	// Random anime pool for DDoS-proof truly random "Surprise Me"
	randomPool      []Anime
	poolMu          sync.RWMutex
	poolInitialized bool
}

const jikanSlowLogThreshold = 750 * time.Millisecond

func NewClient(queries *db.Queries) *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        10,
				IdleConnTimeout:     30 * time.Second,
				DisableKeepAlives:   false,
				TLSHandshakeTimeout: 5 * time.Second,
			},
		},
		baseURL:     "https://api.jikan.moe/v4",
		db:          queries,
		retrySignal: make(chan struct{}, 1),
		refreshSem:  make(chan struct{}, 4),
		randomPool:  make([]Anime, 0),
	}
}

type APIError struct {
	StatusCode int
	URL        string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("jikan api returned status %d", e.StatusCode)
}

// IsRetryableError returns true if the error should trigger a retry.
func IsRetryableError(err error) bool {
	if err == nil {
		return false
	}

	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return isRetryableStatus(apiErr.StatusCode)
	}

	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}

	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	return false
}

func isRetryableStatus(statusCode int) bool {
	if statusCode == http.StatusTooManyRequests {
		return true
	}

	return statusCode >= 500 && statusCode <= 504
}

// retryDelay returns exponential backoff delay: 500ms, 1s, 2s, 4s, 8s (capped).
func retryDelay(attempt int) time.Duration {
	base := 500 * time.Millisecond
	delay := base * time.Duration(1<<attempt)
	if delay > 8*time.Second {
		return 8 * time.Second
	}

	return delay
}

// parseRetryAfter parses Retry-After header value (seconds) into duration.
func parseRetryAfter(value string) (time.Duration, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0, false
	}

	seconds, err := strconv.Atoi(trimmed)
	if err != nil {
		return 0, false
	}

	if seconds <= 0 {
		return 0, false
	}

	return time.Duration(seconds) * time.Second, true
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("request canceled while retrying jikan request: %w", ctx.Err())
	}
}

func jikanTraceEnabled() bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv("MAL_JIKAN_TRACE")))
	return value == "1" || value == "true" || value == "yes"
}

func logJikanCache(cacheKey string, source string, startedAt time.Time, err error) {
	duration := time.Since(startedAt)
	if !jikanTraceEnabled() && err == nil && source == "fresh" && duration < 50*time.Millisecond {
		return
	}
	if !jikanTraceEnabled() && err == nil && source == "refresh" && duration < jikanSlowLogThreshold {
		return
	}

	errorValue := ""
	if err != nil {
		errorValue = err.Error()
	}

	log.Printf(
		"jikan_cache key=%s source=%s duration_ms=%.2f error=%s",
		strconv.Quote(cacheKey),
		source,
		float64(duration.Microseconds())/1000,
		strconv.Quote(errorValue),
	)
}

func logJikanUpstream(urlStr string, statusCode int, attempts int, startedAt time.Time, err error) {
	duration := time.Since(startedAt)
	if !jikanTraceEnabled() && err == nil && statusCode < http.StatusBadRequest && duration < jikanSlowLogThreshold {
		return
	}

	errorValue := ""
	if err != nil {
		errorValue = err.Error()
	}

	log.Printf(
		"jikan_upstream url=%s status=%d attempts=%d duration_ms=%.2f error=%s",
		strconv.Quote(urlStr),
		statusCode,
		attempts,
		float64(duration.Microseconds())/1000,
		strconv.Quote(errorValue),
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

// waitRateLimit enforces Jikan's 3 req/sec rate limit with 400ms spacing.
func (c *Client) waitRateLimit(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	// Jikan has a 3 req/sec limit AND a 60 req/min limit.
	// 400ms base delay keeps us safely under the 3/sec limit.
	nextAllowed := c.lastReqTime.Add(400 * time.Millisecond)
	if now.Before(nextAllowed) {
		timer := time.NewTimer(nextAllowed.Sub(now))
		defer timer.Stop()

		select {
		case <-timer.C:
		case <-ctx.Done():
			return fmt.Errorf("request canceled while waiting for rate limit: %w", ctx.Err())
		}
		c.lastReqTime = time.Now()
	} else {
		c.lastReqTime = now
	}

	return nil
}

// getCache retrieves cached data by key, returns true on cache hit.
func (c *Client) getCache(parentCtx context.Context, key string, out any) bool {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()

	data, err := c.db.GetJikanCache(ctx, key)
	if err != nil {
		return false
	}

	err = json.Unmarshal([]byte(data), out)
	return err == nil
}

// getStaleCache retrieves expired-but-available cache by key.
func (c *Client) getStaleCache(parentCtx context.Context, key string, out any) bool {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()

	data, err := c.db.GetJikanCacheStale(ctx, key)
	if err != nil {
		return false
	}

	err = json.Unmarshal([]byte(data), out)
	return err == nil
}

// setCache stores data in cache with specified TTL.
func (c *Client) setCache(parentCtx context.Context, key string, data any, ttl time.Duration) {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()

	bytes, err := json.Marshal(data)
	if err != nil {
		return
	}

	_ = c.db.SetJikanCache(ctx, db.SetJikanCacheParams{
		Key:       key,
		Data:      string(bytes),
		ExpiresAt: time.Now().Add(ttl),
	})
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

		// Don't cache empty results to avoid caching failures
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

	select {
	case c.refreshSem <- struct{}{}:
	default:
		return
	}

	go func() {
		defer func() { <-c.refreshSem }()

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		_ = c.refreshWithCache(ctx, cacheKey, ttl, url, target)
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

// fetchWithRetry makes HTTP request with exponential backoff retry on transient failures.
func (c *Client) fetchWithRetry(ctx context.Context, urlStr string, out any) error {
	maxRetries := 5
	startedAt := time.Now()
	attempts := 0
	logAndReturn := func(statusCode int, err error) error {
		logJikanUpstream(urlStr, statusCode, attempts, startedAt, err)
		return err
	}

	for attempt := range maxRetries {
		attempts = attempt + 1
		select {
		case <-ctx.Done():
			return logAndReturn(0, fmt.Errorf("request canceled while retrying jikan request: %w", ctx.Err()))
		default:
		}

		if err := c.waitRateLimit(ctx); err != nil {
			return logAndReturn(0, err)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlStr, nil)
		if err != nil {
			return logAndReturn(0, fmt.Errorf("failed to create jikan request: %w", err))
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return logAndReturn(0, fmt.Errorf("request canceled while retrying jikan request: %w", err))
			}
			if attempt < maxRetries-1 && IsRetryableError(err) {
				if retryErr := waitForRetry(ctx, retryDelay(attempt)); retryErr != nil {
					return logAndReturn(0, retryErr)
				}
				continue
			}

			return logAndReturn(0, fmt.Errorf("jikan api error: %w", err))
		}

		if resp.StatusCode != http.StatusOK {
			apiErr := &APIError{StatusCode: resp.StatusCode, URL: urlStr}
			retryable := isRetryableStatus(resp.StatusCode)

			retryAfter := time.Duration(0)
			if parsed, ok := parseRetryAfter(resp.Header.Get("Retry-After")); ok {
				retryAfter = parsed
			}

			if retryable && attempt < maxRetries-1 {
				_ = resp.Body.Close()
				delay := max(retryAfter, retryDelay(attempt))

				if retryErr := waitForRetry(ctx, delay); retryErr != nil {
					return logAndReturn(resp.StatusCode, retryErr)
				}

				continue
			}

			// Best-effort decode (often useful for debugging), but still treat non-200 as error.
			_ = json.NewDecoder(resp.Body).Decode(out)
			_ = resp.Body.Close()
			return logAndReturn(resp.StatusCode, apiErr)
		}

		err = json.NewDecoder(resp.Body).Decode(out)
		_ = resp.Body.Close()
		if err == nil {
			return logAndReturn(resp.StatusCode, nil)
		}

		if attempt < maxRetries-1 {
			if retryErr := waitForRetry(ctx, retryDelay(attempt)); retryErr != nil {
				return logAndReturn(resp.StatusCode, retryErr)
			}
			continue
		}

		return logAndReturn(resp.StatusCode, fmt.Errorf("failed to decode jikan response: %w", err))
	}

	return logAndReturn(0, fmt.Errorf("max retries exceeded for %s", urlStr))
}
