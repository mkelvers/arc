package jikan

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"mal/integrations/watchorder"

	"golang.org/x/sync/errgroup"
)

// chiaki.watchOrderURL is the external watch order tool used for relation ordering.
const chiakiWatchOrderURL = "https://chiaki.site/?/tools/watch_order/id/%d"
const watchOrderCacheTTL = time.Hour * 24
const maxWatchOrderEntries = 120 // cap to prevent huge relation chains

// watchOrderTypeLabel normalizes watch order type to display-friendly labels.
func watchOrderTypeLabel(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "tv":
		return "TV"
	case "movie":
		return "Movie"
	default:
		return strings.TrimSpace(value)
	}
}

// isAllowedWatchOrderType returns true only for TV and Movie types (filters out specials, etc).
func isAllowedWatchOrderType(value string) bool {
	normalized := strings.ToLower(strings.TrimSpace(value))
	return normalized == "tv" || normalized == "movie"
}

func relationCacheKey(id int) string {
	return fmt.Sprintf("relations:watch-order:%d", id)
}

// getWatchOrder fetches watch order from chiaki, caches result for 24h.
func (c *Client) getWatchOrder(ctx context.Context, id int) (watchorder.WatchOrderResult, error) {
	cacheKey := relationCacheKey(id)

	var cached watchorder.WatchOrderResult
	if c.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	watchOrderURL := fmt.Sprintf(chiakiWatchOrderURL, id)
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	result, err := watchorder.FetchWatchOrder(requestCtx, c.httpClient, watchOrderURL)
	if err != nil {
		var statusError *watchorder.HTTPStatusError
		if errors.As(err, &statusError) && statusError.StatusCode == 404 {
			return watchorder.WatchOrderResult{}, watchorder.ErrWatchOrderNotFound
		}
		if errors.Is(err, watchorder.ErrWatchOrderMarkupNotFound) {
			log.Printf("relations: watch-order markup missing for %d (%s): %v", id, watchOrderURL, err)
		} else if errors.As(err, &statusError) {
			log.Printf(
				"relations: watch-order http error for %d (%s): status=%d server=%q cf_ray=%q location=%q content_type=%q body=%q",
				id,
				watchOrderURL,
				statusError.StatusCode,
				statusError.Server,
				statusError.CFRay,
				statusError.Location,
				statusError.ContentType,
				statusError.BodyPreview,
			)
		} else {
			log.Printf("relations: watch-order fetch failed for %d (%s): %v", id, watchOrderURL, err)
		}
		return watchorder.WatchOrderResult{}, err
	}

	c.setCache(ctx, cacheKey, result, watchOrderCacheTTL)
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

// GetFullRelations returns related anime based on watch order, with parallel fetching (3 concurrent).
func (c *Client) GetFullRelations(ctx context.Context, id int) ([]RelationEntry, error) {
	result, err := c.getWatchOrder(ctx, id)
	if err != nil {
		if errors.Is(err, watchorder.ErrWatchOrderNotFound) {
			return c.currentOnlyRelation(ctx, id)
		}
		log.Printf("relations: using current-only fallback for %d: %v", id, err)
		return c.currentOnlyRelation(ctx, id)
	}

	type fetchResult struct {
		index int
		anime Anime
		entry watchorder.WatchOrderEntry
	}

	var allowedEntries []watchorder.WatchOrderEntry
	seen := make(map[int]bool)
	for _, entry := range result.WatchOrder {
		if len(allowedEntries) >= maxWatchOrderEntries {
			break
		}
		if !isAllowedWatchOrderType(entry.Type) || seen[entry.ID] {
			continue
		}
		seen[entry.ID] = true
		allowedEntries = append(allowedEntries, entry)
	}

	g, gCtx := errgroup.WithContext(ctx)
	g.SetLimit(3)

	results := make(chan fetchResult, len(allowedEntries))

	for i, entry := range allowedEntries {
		g.Go(func() error {
			anime, err := c.GetAnimeByID(gCtx, entry.ID)
			if err != nil {
				if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
					return nil
				}
				c.EnqueueAnimeFetchRetry(gCtx, entry.ID, err)
				log.Printf("relations: skipping related anime %d for root %d: %v", entry.ID, id, err)
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
		_ = g.Wait()
		close(results)
	}()

	fetched := make([]fetchResult, 0, len(allowedEntries))
	for res := range results {
		fetched = append(fetched, res)
	}

	// Re-sort because they might have finished out of order
	sort.Slice(fetched, func(i, j int) bool {
		return fetched[i].index < fetched[j].index
	})

	relations := make([]RelationEntry, 0, len(fetched)+1)
	for _, res := range fetched {
		relations = append(relations, RelationEntry{
			Anime:     res.anime,
			Relation:  watchOrderTypeLabel(res.entry.Type),
			IsCurrent: res.entry.ID == id,
			IsExtra:   false,
		})
		if res.entry.ID == id {
			relations[len(relations)-1].Relation = "Current"
		}
	}

	if !seen[id] {
		currentAnime, err := c.GetAnimeByID(ctx, id)
		if err != nil {
			return nil, err
		}

		relations = append([]RelationEntry{{
			Anime:     currentAnime,
			Relation:  "Current",
			IsCurrent: true,
			IsExtra:   false,
		}}, relations...)
	}

	if len(relations) == 0 {
		return c.currentOnlyRelation(ctx, id)
	}

	return relations, nil
}
