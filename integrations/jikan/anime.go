package jikan

import (
	"context"
	"fmt"
	"time"
)

// GetAnimeCharacters returns character list for an anime with voice actor info.
func (c *Client) GetAnimeCharacters(ctx context.Context, id int) ([]CharacterEntry, error) {
	url := fmt.Sprintf("%s/anime/%d/characters", c.baseURL, id)
	cacheKey := fmt.Sprintf("anime:characters:%d", id)

	var resp CharactersResponse
	if err := c.getWithCache(ctx, cacheKey, 24*time.Hour, url, &resp); err != nil {
		return nil, err
	}

	return resp.Data, nil
}

// GetAnimeRecommendations returns user-submitted recommendations for an anime.
func (c *Client) GetAnimeRecommendations(ctx context.Context, id int) ([]RecommendationEntry, error) {
	url := fmt.Sprintf("%s/anime/%d/recommendations", c.baseURL, id)
	cacheKey := fmt.Sprintf("anime:recommendations:%d", id)

	var resp RecommendationsResponse
	if err := c.getWithCache(ctx, cacheKey, 24*time.Hour, url, &resp); err != nil {
		return nil, err
	}

	return resp.Data, nil
}

// GetAnimeByID returns full anime details; finished series cached 30 days, airing cached 1 day.
func (c *Client) GetAnimeByID(ctx context.Context, id int) (Anime, error) {
	cacheKey := fmt.Sprintf("anime:%d", id)

	var cached Anime
	if c.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	if c.getStaleCache(ctx, cacheKey, &cached) && cached.MalID != 0 {
		c.refreshAnimeByIDAsync(id)
		return cached, nil
	}

	anime, err := c.refreshAnimeByID(ctx, id)
	if err != nil {
		var stale Anime
		if c.getStaleCache(ctx, cacheKey, &stale) {
			return stale, nil
		}
		return Anime{}, err
	}

	return anime, nil
}

func (c *Client) refreshAnimeByID(ctx context.Context, id int) (Anime, error) {
	cacheKey := fmt.Sprintf("anime:%d", id)

	value, err, _ := c.sf.Do("refresh:"+cacheKey, func() (any, error) {
		var cached Anime
		if c.getCache(ctx, cacheKey, &cached) && cached.MalID != 0 {
			return cached, nil
		}

		var result AnimeResponse
		reqURL := fmt.Sprintf("%s/anime/%d/full", c.baseURL, id)

		if err := c.fetchWithRetry(ctx, reqURL, &result); err != nil {
			return Anime{}, err
		}

		ttl := time.Hour * 24
		if result.Data.Status == "Finished Airing" {
			ttl = time.Hour * 24 * 30
		}

		c.setCache(ctx, cacheKey, result.Data, ttl)
		return result.Data, nil
	})
	if err != nil {
		return Anime{}, err
	}

	if anime, ok := value.(Anime); ok && anime.MalID != 0 {
		return anime, nil
	}

	return Anime{}, fmt.Errorf("jikan: empty response for %s", cacheKey)
}

func (c *Client) refreshAnimeByIDAsync(id int) {
	select {
	case c.refreshSem <- struct{}{}:
	default:
		return
	}

	go func() {
		defer func() { <-c.refreshSem }()

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		_, _ = c.refreshAnimeByID(ctx, id)
	}()
}
