package jikan

import (
	"context"
	"fmt"
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

// GetRandomAnime returns a random anime from the database.
func (c *Client) GetRandomAnime(ctx context.Context) (Anime, error) {
	var result struct {
		Data Anime `json:"data"`
	}

	reqURL := fmt.Sprintf("%s/random/anime", c.baseURL)
	err := c.fetchWithRetry(ctx, reqURL, &result)
	if err != nil {
		return Anime{}, err
	}

	return result.Data, nil
}
