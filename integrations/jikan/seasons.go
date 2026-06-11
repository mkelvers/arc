package jikan

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/url"
	"strconv"
	"time"
)

type ScheduleResult struct {
	Animes      []Anime
	HasNextPage bool // whether more pages available
}

// GetSeasonsNow returns currently airing anime for the current season.
func (c *Client) GetSeasonsNow(ctx context.Context, page int) (TopAnimeResult, error) {
	return c.getSeasonList(ctx, page, "now")
}

// GetSeasonsUpcoming returns anime scheduled to air in upcoming seasons.
func (c *Client) GetSeasonsUpcoming(ctx context.Context, page int) (TopAnimeResult, error) {
	return c.getSeasonList(ctx, page, "upcoming")
}

func (c *Client) getSeasonList(ctx context.Context, page int, season string) (TopAnimeResult, error) {
	if page < 1 {
		page = 1
	}
	cacheKey := fmt.Sprintf("seasons_%s:%d", season, page)

	var result TopAnimeResponse
	params := url.Values{}
	params.Set("page", strconv.Itoa(page))
	reqURL := buildRequestURL(c.baseURL, fmt.Sprintf("/seasons/%s", season), params)

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
	if !c.markRandomPoolInitialized() {
		return nil
	}

	c.loadCachedRandomPool(ctx)

	// Fetch a solid baseline in the background, then start refreshing.
	go c.seedRandomPoolBaseline()

	return nil
}

func (c *Client) markRandomPoolInitialized() bool {
	c.poolMu.Lock()
	defer c.poolMu.Unlock()

	if c.poolInitialized {
		return false
	}

	c.poolInitialized = true
	return true
}

func (c *Client) loadCachedRandomPool(ctx context.Context) {
	cachedJSONs, err := c.db.GetAllCachedAnime(ctx)
	if err != nil || len(cachedJSONs) == 0 {
		return
	}

	loadedAnimes := decodeCachedAnime(cachedJSONs)
	if len(loadedAnimes) == 0 {
		return
	}

	c.poolMu.Lock()
	c.randomPool = append(c.randomPool, loadedAnimes...)
	c.poolMu.Unlock()
}

func decodeCachedAnime(cachedJSONs []string) []Anime {
	loadedAnimes := make([]Anime, 0, len(cachedJSONs))
	for _, dataStr := range cachedJSONs {
		var anime Anime
		if err := json.Unmarshal([]byte(dataStr), &anime); err != nil || anime.MalID == 0 {
			continue
		}

		loadedAnimes = append(loadedAnimes, anime)
	}

	return loadedAnimes
}

func (c *Client) seedRandomPoolBaseline() {
	bgCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	fetchedAnimes := c.fetchBaselineAnime(bgCtx)
	if len(fetchedAnimes) > 0 {
		c.appendUniqueRandomPool(fetchedAnimes)
	}

	// Start background refresher once seeding completes
	c.startPoolRefresher()
}

func (c *Client) fetchBaselineAnime(ctx context.Context) []Anime {
	fetchedAnimes := make([]Anime, 0)
	fetchedAnimes = append(fetchedAnimes, c.fetchTopAnimePage(ctx, 1)...)
	fetchedAnimes = append(fetchedAnimes, c.fetchTopAnimePage(ctx, 2)...)
	fetchedAnimes = append(fetchedAnimes, c.fetchCurrentSeasonAnime(ctx)...)
	return fetchedAnimes
}

func (c *Client) fetchTopAnimePage(ctx context.Context, page int) []Anime {
	top, err := c.GetTopAnime(ctx, page)
	if err != nil {
		return nil
	}

	return top.Animes
}

func (c *Client) fetchCurrentSeasonAnime(ctx context.Context) []Anime {
	now, err := c.GetSeasonsNow(ctx, 1)
	if err != nil {
		return nil
	}

	return now.Animes
}

func (c *Client) appendUniqueRandomPool(animes []Anime) {
	c.poolMu.Lock()
	defer c.poolMu.Unlock()

	seen := make(map[int]bool, len(c.randomPool)+len(animes))
	for _, anime := range c.randomPool {
		seen[anime.MalID] = true
	}

	for _, anime := range animes {
		if seen[anime.MalID] {
			continue
		}

		c.randomPool = append(c.randomPool, anime)
		seen[anime.MalID] = true
	}
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
