package jikan

import (
	"context"
	"fmt"
	"time"
)

func (c *Client) GetAnimeCharacters(ctx context.Context, id int) ([]CharacterEntry, error) {
	url := fmt.Sprintf("%s/anime/%d/characters", c.baseURL, id)
	cacheKey := fmt.Sprintf("anime:characters:%d", id)

	var resp CharactersResponse
	if err := c.getWithCache(ctx, cacheKey, 24*time.Hour, url, &resp); err != nil {
		return nil, err
	}

	return resp.Data, nil
}

func (c *Client) GetAnimeRecommendations(ctx context.Context, id int) ([]RecommendationEntry, error) {
	url := fmt.Sprintf("%s/anime/%d/recommendations", c.baseURL, id)
	cacheKey := fmt.Sprintf("anime:recommendations:%d", id)

	var resp RecommendationsResponse
	if err := c.getWithCache(ctx, cacheKey, 24*time.Hour, url, &resp); err != nil {
		return nil, err
	}

	return resp.Data, nil
}

func (c *Client) GetAnimeByID(ctx context.Context, id int) (Anime, error) {
	cacheKey := fmt.Sprintf("anime:%d", id)

	var cached Anime
	if c.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	var result AnimeResponse
	reqURL := fmt.Sprintf("%s/anime/%d/full", c.baseURL, id)

	if err := c.fetchWithRetry(ctx, reqURL, &result); err != nil {
		var stale Anime
		if c.getStaleCache(ctx, cacheKey, &stale) {
			return stale, nil
		}
		return Anime{}, err
	}

	ttl := time.Hour * 24
	if result.Data.Status == "Finished Airing" {
		ttl = time.Hour * 24 * 30
	}

	c.setCache(ctx, cacheKey, result.Data, ttl)
	return result.Data, nil
}
