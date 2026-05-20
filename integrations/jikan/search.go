package jikan

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// SearchAdvanced performs a filtered anime search with type, status, ordering, and genre filters.
func (c *Client) SearchAdvanced(ctx context.Context, query, animeType, status, orderBy, sort string, genres []int, sfw bool, page, limit int) (SearchResult, error) {
	if page < 1 {
		page = 1
	}
	if limit < 0 {
		limit = 0
	}

	genresParam := ""
	if len(genres) > 0 {
		ids := make([]string, len(genres))
		for i, g := range genres {
			ids[i] = strconv.Itoa(g)
		}
		genresParam = strings.Join(ids, ",")
	}

	cacheKey := fmt.Sprintf("search:%s:%s:%s:%s:%s:%s:%v:%d:%d", query, animeType, status, orderBy, sort, genresParam, sfw, page, limit)

	var result SearchResponse
	reqURL := fmt.Sprintf("%s/anime?page=%d", c.baseURL, page)
	if sfw {
		reqURL += "&sfw=true"
	}
	if query != "" {
		reqURL += "&q=" + url.QueryEscape(query)
	}
	if animeType != "" {
		reqURL += "&type=" + url.QueryEscape(animeType)
	}
	if status != "" {
		reqURL += "&status=" + url.QueryEscape(status)
	}
	if orderBy != "" {
		reqURL += "&order_by=" + url.QueryEscape(orderBy)
	}
	if sort != "" {
		reqURL += "&sort=" + url.QueryEscape(sort)
	}
	if genresParam != "" {
		reqURL += "&genres=" + genresParam
	}
	if limit > 0 {
		reqURL += fmt.Sprintf("&limit=%d", limit)
	}

	if err := c.getWithCache(ctx, cacheKey, shortCacheTTL, reqURL, &result); err != nil {
		return SearchResult{}, err
	}

	return SearchResult{
		Animes:      result.Data,
		HasNextPage: result.Pagination.HasNextPage,
	}, nil
}

// GetTopAnime returns the top-rated anime list for a given page.
func (c *Client) GetTopAnime(ctx context.Context, page int) (TopAnimeResult, error) {
	if page < 1 {
		page = 1
	}
	cacheKey := fmt.Sprintf("top:%d", page)

	var result TopAnimeResponse
	reqURL := fmt.Sprintf("%s/top/anime?page=%d", c.baseURL, page)

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
