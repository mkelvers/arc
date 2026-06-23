package transport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mal/integrations/jikan/rate"
	"mal/internal/observability"
	errlog "mal/pkg"
	netutil "mal/pkg/net"
)

const slowLogThreshold = 750 * time.Millisecond

type Client struct {
	HTTPClient   *http.Client
	Limiter      *rate.Limiter
	TraceEnabled func() bool
}

type Config struct {
	HTTPClient   *http.Client
	Limiter      *rate.Limiter
	TraceEnabled func() bool
}

type APIError struct {
	StatusCode int
	URL        string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("jikan api returned status %d", e.StatusCode)
}

func NewHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        10,
			IdleConnTimeout:     30 * time.Second,
			DisableKeepAlives:   false,
			TLSHandshakeTimeout: 5 * time.Second,
		},
	}
}

func NewClient(cfg Config) *Client {
	return &Client{
		HTTPClient:   cfg.HTTPClient,
		Limiter:      cfg.Limiter,
		TraceEnabled: cfg.TraceEnabled,
	}
}

// IsRetryableError returns true if the error should trigger a retry.
func IsRetryableError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) {
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

// FetchWithRetry makes an HTTP request with exponential backoff on transient failures.
func (c *Client) FetchWithRetry(ctx context.Context, urlStr string, out any) error {
	maxRetries := 5
	startedAt := time.Now()
	attempts := 0
	logAndReturn := func(statusCode int, err error) error {
		if isDoneContextError(ctx, err) {
			return err
		}
		c.logUpstream(urlStr, statusCode, attempts, startedAt, err)
		return err
	}

	for attempt := range maxRetries {
		attempts = attempt + 1
		if err := c.prepareRetryAttempt(ctx); err != nil {
			return logAndReturn(0, err)
		}

		resp, err := c.doRequest(ctx, urlStr)
		if err != nil {
			retry, requestErr := handleRequestRetry(ctx, err, attempt, maxRetries)
			if retry {
				continue
			}

			return logAndReturn(0, requestErr)
		}

		statusCode, retry, err := func() (int, bool, error) {
			defer func() {
				errlog.Log("failed to close jikan response body", resp.Body.Close())
			}()
			return handleResponseRetry(ctx, resp, urlStr, out, attempt, maxRetries)
		}()
		if retry {
			continue
		}

		return logAndReturn(statusCode, err)
	}

	return logAndReturn(0, fmt.Errorf("max retries exceeded for %s", urlStr))
}

func (c *Client) prepareRetryAttempt(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	return c.Limiter.Wait(ctx)
}

func (c *Client) doRequest(ctx context.Context, urlStr string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlStr, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create jikan request: %w", err)
	}

	req.Header.Set("User-Agent", netutil.Generic)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}

	return resp, nil
}

func handleRequestRetry(ctx context.Context, err error, attempt int, maxRetries int) (bool, error) {
	if ctx.Err() != nil {
		return false, ctx.Err()
	}
	if errors.Is(err, context.Canceled) {
		return false, err
	}

	if attempt >= maxRetries-1 || !IsRetryableError(err) {
		return false, fmt.Errorf("jikan api error: %w", err)
	}

	if retryErr := waitForRetry(ctx, retryDelay(attempt)); retryErr != nil {
		return false, retryErr
	}

	return true, nil
}

func handleResponseRetry(ctx context.Context, resp *http.Response, urlStr string, out any, attempt int, maxRetries int) (int, bool, error) {
	if resp.StatusCode != http.StatusOK {
		return handleStatusRetry(ctx, resp, urlStr, out, attempt, maxRetries)
	}

	err := json.NewDecoder(resp.Body).Decode(out)
	if err == nil {
		return resp.StatusCode, false, nil
	}

	if attempt < maxRetries-1 {
		if retryErr := waitForRetry(ctx, retryDelay(attempt)); retryErr != nil {
			return resp.StatusCode, false, retryErr
		}
		return resp.StatusCode, true, nil
	}

	return resp.StatusCode, false, fmt.Errorf("failed to decode jikan response: %w", err)
}

func handleStatusRetry(ctx context.Context, resp *http.Response, urlStr string, out any, attempt int, maxRetries int) (int, bool, error) {
	statusCode := resp.StatusCode
	apiErr := &APIError{StatusCode: statusCode, URL: urlStr}

	retryAfter := time.Duration(0)
	if parsed, ok := parseRetryAfter(resp.Header.Get("Retry-After")); ok {
		retryAfter = parsed
	}

	if isRetryableStatus(statusCode) && attempt < maxRetries-1 {
		if retryErr := waitForRetry(ctx, max(retryAfter, retryDelay(attempt))); retryErr != nil {
			return statusCode, false, retryErr
		}
		return statusCode, true, nil
	}

	// Best-effort decode (often useful for debugging), but still treat non-200 as error.
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return statusCode, false, errors.Join(apiErr, fmt.Errorf("failed to decode error response: %w", err))
	}
	return statusCode, false, apiErr
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
		return ctx.Err()
	}
}

func isDoneContextError(ctx context.Context, err error) bool {
	return err != nil && ctx.Err() != nil && errors.Is(err, ctx.Err())
}

func (c *Client) logUpstream(urlStr string, statusCode int, attempts int, startedAt time.Time, err error) {
	duration := time.Since(startedAt)
	traceEnabled := c.TraceEnabled != nil && c.TraceEnabled()
	if !traceEnabled && err == nil && statusCode < http.StatusBadRequest && duration < slowLogThreshold {
		return
	}

	level := observability.LogLevelInfo
	if err != nil || statusCode >= http.StatusInternalServerError {
		level = observability.LogLevelError
	} else if statusCode == http.StatusTooManyRequests || statusCode >= http.StatusBadRequest {
		level = observability.LogLevelWarn
	}

	observability.LogJSON(
		level,
		"jikan_upstream",
		"jikan",
		"",
		map[string]any{
			"url":         urlStr,
			"endpoint":    endpointLabel(urlStr),
			"status":      statusCode,
			"attempts":    attempts,
			"duration_ms": float64(duration.Microseconds()) / 1000,
		},
		err,
	)
}

func endpointLabel(urlStr string) string {
	trimmed := strings.TrimSpace(urlStr)
	if trimmed == "" {
		return "unknown"
	}

	prefix := "https://api.jikan.moe/v4"
	trimmed = strings.TrimPrefix(trimmed, prefix)

	if idx := strings.Index(trimmed, "?"); idx >= 0 {
		trimmed = trimmed[:idx]
	}

	parts := strings.Split(trimmed, "/")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		if _, err := strconv.Atoi(part); err == nil {
			out = append(out, "{id}")
			continue
		}
		out = append(out, part)
	}

	if len(out) == 0 {
		return "/"
	}

	return "/" + strings.Join(out, "/")
}
