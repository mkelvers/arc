package jikan

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

func normalizeSearchPagination(page, limit int) (int, int) {
	if page < 1 {
		page = 1
	}
	if limit < 0 {
		limit = 0
	}

	return page, limit
}

func joinGenreIDs(genres []int) string {
	if len(genres) == 0 {
		return ""
	}

	ids := make([]string, len(genres))
	for i, g := range genres {
		ids[i] = strconv.Itoa(g)
	}

	return strings.Join(ids, ",")
}

func buildAdvancedSearchURL(baseURL, query, animeType, status, orderBy, sort, genres string, studioID int, sfw bool, page, limit int) string {
	params := url.Values{}
	params.Set("page", strconv.Itoa(page))
	setTrueQueryValue(params, "sfw", sfw)
	setQueryValue(params, "q", query)
	setQueryValue(params, "type", animeType)
	setQueryValue(params, "status", status)
	setPositiveIntQueryValue(params, "producers", studioID)
	setQueryValue(params, "order_by", orderBy)
	setQueryValue(params, "sort", sort)
	setQueryValue(params, "genres", genres)
	setPositiveIntQueryValue(params, "limit", limit)

	return buildRequestURL(baseURL, "/anime", params)
}

// SearchAdvanced performs a filtered anime search with type, status, ordering, genre filters, and studio (producer) filters.
func (c *Client) SearchAdvanced(ctx context.Context, query, animeType, status, orderBy, sort string, genres []int, studioID int, sfw bool, page, limit int) (SearchResult, error) {
	page, limit = normalizeSearchPagination(page, limit)
	genresParam := joinGenreIDs(genres)

	cacheKey := fmt.Sprintf("search:%s:%s:%s:%s:%s:%s:%d:%v:%d:%d", query, animeType, status, orderBy, sort, genresParam, studioID, sfw, page, limit)

	var result SearchResponse
	reqURL := buildAdvancedSearchURL(c.baseURL, query, animeType, status, orderBy, sort, genresParam, studioID, sfw, page, limit)

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
