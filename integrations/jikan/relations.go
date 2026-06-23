package jikan

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"mal/internal/observability"

	"mal/integrations/watchorder"

	"golang.org/x/sync/errgroup"
)

// chiaki.watchOrderURL is the external watch order tool used for relation ordering.
const chiakiWatchOrderURL = "https://chiaki.site/?/tools/watch_order/id/%d"
const watchOrderCacheTTL = time.Hour * 24
const maxWatchOrderEntries = 120 // cap to prevent huge relation chains

type WatchOrderMode string

const (
	WatchOrderModeMain     WatchOrderMode = "main"
	WatchOrderModeComplete WatchOrderMode = "complete"
)

func NormalizeWatchOrderMode(value string) WatchOrderMode {
	switch WatchOrderMode(strings.ToLower(strings.TrimSpace(value))) {
	case WatchOrderModeComplete:
		return WatchOrderModeComplete
	default:
		return WatchOrderModeMain
	}
}

// watchOrderTypeLabel normalizes watch order type to display-friendly labels.
func watchOrderTypeLabel(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "tv":
		return "TV"
	case "movie":
		return "Movie"
	case "ona":
		return "ONA"
	case "ova":
		return "OVA"
	default:
		return strings.TrimSpace(value)
	}
}

func (c *Client) refreshWatchOrder(ctx context.Context, id int) (watchorder.WatchOrderResult, error) {
	cacheKey := fmt.Sprintf("relations:watch-order:%d", id)
	watchOrderURL := fmt.Sprintf(chiakiWatchOrderURL, id)
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	result, err := watchorder.FetchWatchOrder(requestCtx, c.fetcher.HTTPClient, watchOrderURL)
	if err != nil {
		var statusError *watchorder.HTTPStatusError
		if errors.As(err, &statusError) && statusError.StatusCode == http.StatusNotFound {
			return watchorder.WatchOrderResult{}, watchorder.ErrWatchOrderNotFound
		}
		if errors.Is(err, watchorder.ErrWatchOrderMarkupNotFound) {
			observability.Warn(
				"relations_watch_order_markup_missing",
				"jikan",
				"",
				map[string]any{
					"anime_id": id,
					"url":      watchOrderURL,
				},
				err,
			)
		} else if errors.As(err, &statusError) {
			observability.Warn(
				"relations_watch_order_http_error",
				"jikan",
				"",
				map[string]any{
					"anime_id":     id,
					"url":          watchOrderURL,
					"status":       statusError.StatusCode,
					"server":       statusError.Server,
					"cf_ray":       statusError.CFRay,
					"location":     statusError.Location,
					"content_type": statusError.ContentType,
					"body_preview": statusError.BodyPreview,
				},
				err,
			)
		} else {
			observability.Warn(
				"relations_watch_order_fetch_failed",
				"jikan",
				"",
				map[string]any{
					"anime_id": id,
					"url":      watchOrderURL,
				},
				err,
			)
		}
		return watchorder.WatchOrderResult{}, err
	}

	c.setCache(ctx, cacheKey, result, watchOrderCacheTTL)
	return result, nil
}

func (c *Client) refreshWatchOrderAsync(id int) {
	c.runAsyncRefresh(func(ctx context.Context) {
		if _, err := c.refreshWatchOrder(ctx, id); err != nil {
			observability.Warn(
				"relations_watch_order_async_refresh_failed",
				"jikan",
				"",
				map[string]any{"anime_id": id},
				err,
			)
		}
	})
}

// getWatchOrder fetches watch order from chiaki, caches result for 24h.
func (c *Client) getWatchOrder(ctx context.Context, id int) (watchorder.WatchOrderResult, error) {
	cacheKey := fmt.Sprintf("relations:watch-order:%d", id)

	var cached watchorder.WatchOrderResult
	if c.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	if c.getStaleCache(ctx, cacheKey, &cached) {
		c.refreshWatchOrderAsync(id)
		return cached, nil
	}

	result, err := c.refreshWatchOrder(ctx, id)
	if err != nil {
		if c.getStaleCache(ctx, cacheKey, &cached) {
			return cached, nil
		}
		return watchorder.WatchOrderResult{}, err
	}

	return result, nil
}

// currentOnlyRelation returns just the current anime when watch order lookup fails.
func (c *Client) currentOnlyRelation(ctx context.Context, id int) ([]RelationEntry, error) {
	currentAnime, err := c.GetAnimeByID(ctx, id)
	if err != nil {
		return nil, err
	}

	return []RelationEntry{{
		Anime:     currentAnime,
		Relation:  "Current",
		IsCurrent: true,
		IsExtra:   false,
	}}, nil
}

func (c *Client) handleWatchOrderError(ctx context.Context, id int, err error) ([]RelationEntry, error) {
	if errors.Is(err, watchorder.ErrWatchOrderNotFound) {
		return c.currentOnlyRelation(ctx, id)
	}

	observability.Warn(
		"relations_watch_order_fallback_current_only",
		"jikan",
		"",
		map[string]any{
			"anime_id": id,
		},
		err,
	)

	return c.currentOnlyRelation(ctx, id)
}

// relation filter
func allowedWatchOrder(result watchorder.WatchOrderResult, mode WatchOrderMode) ([]watchorder.WatchOrderEntry, map[int]bool) {
	allowedEntries := make([]watchorder.WatchOrderEntry, 0, len(result.WatchOrder))
	seen := make(map[int]bool)
	hasTVEntry := false
	for _, entry := range result.WatchOrder {
		if strings.EqualFold(strings.TrimSpace(entry.Type), "tv") {
			hasTVEntry = true
			break
		}
	}
	allTypes := mode == WatchOrderModeComplete || !hasTVEntry

	for _, entry := range result.WatchOrder {
		if len(allowedEntries) >= maxWatchOrderEntries {
			break
		}
		if seen[entry.ID] {
			continue
		}
		typ := strings.ToLower(strings.TrimSpace(entry.Type))
		if !allTypes && typ != "tv" && typ != "movie" {
			continue
		}

		seen[entry.ID] = true
		allowedEntries = append(allowedEntries, entry)
	}

	return allowedEntries, seen
}

func (c *Client) fetchEntries(ctx context.Context, entries []watchorder.WatchOrderEntry) chan fetchResult {
	g, gCtx := errgroup.WithContext(ctx)
	g.SetLimit(3)

	results := make(chan fetchResult, len(entries))

	for i, entry := range entries {
		g.Go(func() error {
			anime, err := c.GetAnimeByID(gCtx, entry.ID)
			if err != nil {
				if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
					return nil
				}
				observability.Warn(
					"relations_fetch_entry_failed",
					"jikan",
					"",
					map[string]any{
						"anime_id": entry.ID,
						"index":    i,
					},
					err,
				)
				c.EnqueueAnimeFetchRetry(gCtx, entry.ID, err)
				return nil
			}

			select {
			case results <- fetchResult{index: i, anime: anime, entry: entry}:
			case <-gCtx.Done():
			}

			return nil
		})
	}

	go func() {
		if err := g.Wait(); err != nil {
			observability.Warn("relations_fetch_group_failed", "jikan", "", nil, err)
		}
		close(results)
	}()

	return results
}

func (c *Client) fetchResults(ctx context.Context, entries []watchorder.WatchOrderEntry) []fetchResult {
	results := c.fetchEntries(ctx, entries)

	fetched := make([]fetchResult, 0, len(entries))
	for res := range results {
		fetched = append(fetched, res)
	}

	if len(fetched) < len(entries) {
		observability.Warn(
			"relations_fetch_incomplete",
			"jikan",
			"",
			map[string]any{
				"expected": len(entries),
				"fetched":  len(fetched),
				"missing":  len(entries) - len(fetched),
			},
			nil,
		)
	}

	sort.Slice(fetched, func(i, j int) bool {
		return fetched[i].index < fetched[j].index
	})

	return fetched
}

func buildRelations(results []fetchResult, id int) []RelationEntry {
	relations := make([]RelationEntry, 0, len(results)+1)
	for _, res := range results {
		relations = append(relations, RelationEntry{
			Anime:     res.anime,
			Relation:  watchOrderTypeLabel(res.entry.Type),
			IsCurrent: res.entry.ID == id,
			IsExtra:   false,
		})
	}

	return relations
}

func (c *Client) ensureCurrent(ctx context.Context, id int, seen map[int]bool, relations []RelationEntry) ([]RelationEntry, error) {
	if seen[id] {
		return relations, nil
	}

	currentAnime, err := c.GetAnimeByID(ctx, id)
	if err != nil {
		return nil, err
	}

	return append([]RelationEntry{{
		Anime:     currentAnime,
		Relation:  "Current",
		IsCurrent: true,
		IsExtra:   false,
	}}, relations...), nil
}

type fetchResult struct {
	index int
	anime Anime
	entry watchorder.WatchOrderEntry
}

// GetFullRelations returns related anime based on watch order, with parallel fetching (3 concurrent).
func (c *Client) GetFullRelations(ctx context.Context, id int, mode WatchOrderMode) ([]RelationEntry, error) {
	result, err := c.getWatchOrder(ctx, id)
	if err != nil {
		return c.handleWatchOrderError(ctx, id, err)
	}

	allowedEntries, seen := allowedWatchOrder(result, mode)
	fetched := c.fetchResults(ctx, allowedEntries)
	relations := buildRelations(fetched, id)
	relations, err = c.ensureCurrent(ctx, id, seen, relations)
	if err != nil {
		return nil, err
	}

	if len(relations) == 0 {
		return c.currentOnlyRelation(ctx, id)
	}

	return relations, nil
}

func (c *Client) WarmFullRelations(id int) {
	c.runAsyncRefresh(func(ctx context.Context) {
		if _, err := c.GetFullRelations(ctx, id, WatchOrderModeMain); err != nil {
			observability.Warn(
				"relations_warm_full_failed",
				"jikan",
				"",
				map[string]any{"anime_id": id},
				err,
			)
		}
	})
}
