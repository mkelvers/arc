package jikan

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

func normalizePage(page, limit int) (int, int) {
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

func advancedURL(baseURL, query, animeType, status, orderBy, sort, genres string, studioID int, sfw bool, page, limit int) string {
	params := url.Values{}
	params.Set("page", strconv.Itoa(page))
	setTrueQueryValue(params, "sfw", sfw)
	setQueryValue(params, "q", query)
	setQueryValue(params, "type", animeType)
	setQueryValue(params, "status", status)
	setPositiveInt(params, "producers", studioID)
	setQueryValue(params, "order_by", orderBy)
	setQueryValue(params, "sort", sort)
	setQueryValue(params, "genres", genres)
	setPositiveInt(params, "limit", limit)

	return buildRequestURL(baseURL, "/anime", params)
}

// SearchAdvanced performs a filtered anime search with type, status, ordering, genre filters, and studio (producer) filters.
func (c *Client) SearchAdvanced(ctx context.Context, query, animeType, status, orderBy, sort string, genres []int, studioID int, sfw bool, page, limit int) (SearchResult, error) {
	page, limit = normalizePage(page, limit)
	genresParam := joinGenreIDs(genres)

	cacheKey := fmt.Sprintf("search:%s:%s:%s:%s:%s:%s:%d:%v:%d:%d", query, animeType, status, orderBy, sort, genresParam, studioID, sfw, page, limit)

	var result SearchResponse
	reqURL := advancedURL(c.baseURL, query, animeType, status, orderBy, sort, genresParam, studioID, sfw, page, limit)

	if err := c.getWithCache(ctx, cacheKey, shortCacheTTL, reqURL, &result); err != nil {
		return SearchResult{}, err
	}

	return SearchResult{
		Animes:      result.Data,
		HasNextPage: result.Pagination.HasNextPage,
	}, nil
}
