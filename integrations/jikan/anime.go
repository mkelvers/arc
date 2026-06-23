package jikan

import (
	"context"
	"fmt"
	"mal/internal/observability"
	"net/url"
	"strconv"
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

func (c *Client) WarmAnimeRecommendations(id int) {
	url := fmt.Sprintf("%s/anime/%d/recommendations", c.baseURL, id)
	cacheKey := fmt.Sprintf("anime:recommendations:%d", id)

	c.runAsyncRefresh(func(ctx context.Context) {
		var resp RecommendationsResponse
		if err := c.getWithCache(ctx, cacheKey, 24*time.Hour, url, &resp); err != nil {
			c.EnqueueAnimeFetchRetry(ctx, id, err)
		}
	})
}

// GetTopAnime returns the top-rated anime list for a given page.
func (c *Client) GetTopAnime(ctx context.Context, page int) (TopAnimeResult, error) {
	if page < 1 {
		page = 1
	}
	cacheKey := fmt.Sprintf("top:%d", page)

	var result TopAnimeResponse
	params := url.Values{}
	params.Set("page", strconv.Itoa(page))
	reqURL := buildRequestURL(c.baseURL, "/top/anime", params)

	if err := c.getWithCache(ctx, cacheKey, shortCacheTTL, reqURL, &result); err != nil {
		return TopAnimeResult{}, err
	}

	return TopAnimeResult{
		Animes:      result.Data,
		HasNextPage: result.Pagination.HasNextPage,
	}, nil
}

// GetAnimeGenres returns list of all anime genres, cached long-term.
func (c *Client) GetAnimeGenres(ctx context.Context) ([]Genre, error) {
	const cacheKey = "anime_genres"

	var result GenresResponse
	reqURL := fmt.Sprintf("%s/genres/anime", c.baseURL)

	if err := c.getWithCache(ctx, cacheKey, longCacheTTL, reqURL, &result); err != nil {
		return nil, err
	}

	return result.Data, nil
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

	value, err, shared := c.sf.Do("refresh:"+cacheKey, func() (any, error) {
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
	if shared {
		observability.Info(
			"jikan_anime_refresh_shared",
			"jikan",
			"",
			map[string]any{"anime_id": id, "cache_key": cacheKey},
		)
	}

	if anime, ok := value.(Anime); ok && anime.MalID != 0 {
		return anime, nil
	}

	return Anime{}, fmt.Errorf("jikan: empty response for %s", cacheKey)
}

func (c *Client) refreshAnimeByIDAsync(id int) {
	c.runAsyncRefresh(func(ctx context.Context) {
		if _, err := c.refreshAnimeByID(ctx, id); err != nil {
			c.EnqueueAnimeFetchRetry(ctx, id, err)
		}
	})
}
