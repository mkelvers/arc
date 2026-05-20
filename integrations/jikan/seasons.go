package jikan

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"time"
)

type ScheduleResult struct {
	Animes      []Anime
	HasNextPage bool // whether more pages available
}

// GetSeasonsNow returns currently airing anime for the current season.
func (c *Client) GetSeasonsNow(ctx context.Context, page int) (TopAnimeResult, error) {
	if page < 1 {
		page = 1
	}
	cacheKey := fmt.Sprintf("seasons_now:%d", page)

	var result TopAnimeResponse
	reqURL := fmt.Sprintf("%s/seasons/now?page=%d", c.baseURL, page)

	err := c.getWithCache(ctx, cacheKey, shortCacheTTL, reqURL, &result)
	if err != nil {
		return TopAnimeResult{}, err
	}

	return TopAnimeResult{
		Animes:      result.Data,
		HasNextPage: result.Pagination.HasNextPage,
	}, nil
}

// GetSeasonsUpcoming returns anime scheduled to air in upcoming seasons.
func (c *Client) GetSeasonsUpcoming(ctx context.Context, page int) (TopAnimeResult, error) {
	if page < 1 {
		page = 1
	}
	cacheKey := fmt.Sprintf("seasons_upcoming:%d", page)

	var result TopAnimeResponse
	reqURL := fmt.Sprintf("%s/seasons/upcoming?page=%d", c.baseURL, page)

	err := c.getWithCache(ctx, cacheKey, shortCacheTTL, reqURL, &result)
	if err != nil {
		return TopAnimeResult{}, err
	}

	return TopAnimeResult{
		Animes:      result.Data,
		HasNextPage: result.Pagination.HasNextPage,
	}, nil
}

// seedRandomPool seeds the in-memory pool of random anime
func (c *Client) seedRandomPool(ctx context.Context) error {
	c.poolMu.Lock()
	if c.poolInitialized {
		c.poolMu.Unlock()
		return nil
	}
	c.poolInitialized = true
	c.poolMu.Unlock()

	// 1. Try to load all cached anime from the database
	cachedJSONs, err := c.db.GetAllCachedAnime(ctx)
	if err == nil && len(cachedJSONs) > 0 {
		var loadedAnimes []Anime
		for _, dataStr := range cachedJSONs {
			var anime Anime
			if err := json.Unmarshal([]byte(dataStr), &anime); err == nil && anime.MalID > 0 {
				loadedAnimes = append(loadedAnimes, anime)
			}
		}

		if len(loadedAnimes) > 0 {
			c.poolMu.Lock()
			c.randomPool = append(c.randomPool, loadedAnimes...)
			c.poolMu.Unlock()
		}
	}

	// 2. Fetch Top Anime page 1 & 2 to ensure we have a robust baseline of high-quality popular anime
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		var fetchedAnimes []Anime

		top, err := c.GetTopAnime(bgCtx, 1)
		if err == nil && len(top.Animes) > 0 {
			fetchedAnimes = append(fetchedAnimes, top.Animes...)
		}

		top2, err := c.GetTopAnime(bgCtx, 2)
		if err == nil && len(top2.Animes) > 0 {
			fetchedAnimes = append(fetchedAnimes, top2.Animes...)
		}

		now, err := c.GetSeasonsNow(bgCtx, 1)
		if err == nil && len(now.Animes) > 0 {
			fetchedAnimes = append(fetchedAnimes, now.Animes...)
		}

		if len(fetchedAnimes) > 0 {
			c.poolMu.Lock()
			// Use map to de-duplicate any anime
			seen := make(map[int]bool)
			for _, a := range c.randomPool {
				seen[a.MalID] = true
			}
			for _, a := range fetchedAnimes {
				if !seen[a.MalID] {
					c.randomPool = append(c.randomPool, a)
					seen[a.MalID] = true
				}
			}
			c.poolMu.Unlock()
		}

		// Start background refresher once seeding completes
		c.startPoolRefresher()
	}()

	return nil
}

// startPoolRefresher runs in the background to slowly mix in true random anime
func (c *Client) startPoolRefresher() {
	ticker := time.NewTicker(30 * time.Second)
	ctx := context.Background()

	for range ticker.C {
		var result struct {
			Data Anime `json:"data"`
		}
		reqURL := fmt.Sprintf("%s/random/anime", c.baseURL)
		err := c.fetchWithRetry(ctx, reqURL, &result)
		if err != nil {
			continue
		}

		if result.Data.MalID == 0 {
			continue
		}

		c.poolMu.Lock()
		if len(c.randomPool) >= 1000 {
			idx := rand.Intn(len(c.randomPool))
			c.randomPool[idx] = result.Data
		} else {
			duplicate := false
			for _, a := range c.randomPool {
				if a.MalID == result.Data.MalID {
					duplicate = true
					break
				}
			}
			if !duplicate {
				c.randomPool = append(c.randomPool, result.Data)
			}
		}
		c.poolMu.Unlock()
	}
}

// GetRandomAnime returns a random anime from the database.
func (c *Client) GetRandomAnime(ctx context.Context) (Anime, error) {
	c.poolMu.Lock()
	initialized := c.poolInitialized
	c.poolMu.Unlock()

	if !initialized {
		_ = c.seedRandomPool(ctx)
	}

	c.poolMu.RLock()
	defer c.poolMu.RUnlock()

	if len(c.randomPool) == 0 {
		var result struct {
			Data Anime `json:"data"`
		}

		reqURL := fmt.Sprintf("%s/random/anime", c.baseURL)
		err := c.fetchWithRetry(ctx, reqURL, &result)
		if err != nil {
			return Anime{}, err
		}
		if result.Data.MalID == 0 {
			return Anime{}, fmt.Errorf("jikan: empty response for random/anime")
		}

		return result.Data, nil
	}

	idx := rand.Intn(len(c.randomPool))
	return c.randomPool[idx], nil
}
