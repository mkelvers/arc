package jikan

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
)

func (c *Client) GetAnimeStaff(ctx context.Context, id int) ([]StaffEntry, error) {
	url := fmt.Sprintf("%s/anime/%d/staff", c.baseURL, id)
	cacheKey := fmt.Sprintf("anime:staff:%d", id)

	var resp StaffResponse
	if err := c.getWithCache(ctx, cacheKey, longCacheTTL, url, &resp); err != nil {
		return nil, err
	}

	return resp.Data, nil
}

func (c *Client) GetAnimeStatistics(ctx context.Context, id int) (Statistics, error) {
	url := fmt.Sprintf("%s/anime/%d/statistics", c.baseURL, id)
	cacheKey := fmt.Sprintf("anime:statistics:%d", id)

	var resp StatisticsResponse
	if err := c.getWithCache(ctx, cacheKey, shortCacheTTL, url, &resp); err != nil {
		return Statistics{}, err
	}

	return resp.Data, nil
}

func (c *Client) GetAnimeThemes(ctx context.Context, id int) (ThemesData, error) {
	url := fmt.Sprintf("%s/anime/%d/themes", c.baseURL, id)
	cacheKey := fmt.Sprintf("anime:themes:%d", id)

	var resp ThemesResponse
	if err := c.getWithCache(ctx, cacheKey, longCacheTTL, url, &resp); err != nil {
		return ThemesData{}, err
	}

	return resp.Data, nil
}

func (c *Client) GetAnimeReviews(ctx context.Context, id int, page int) ([]ReviewEntry, Pagination, error) {
	if page < 1 {
		page = 1
	}

	params := url.Values{}
	params.Set("page", strconv.Itoa(page))
	url := buildRequestURL(c.baseURL, fmt.Sprintf("/anime/%d/reviews", id), params)
	cacheKey := fmt.Sprintf("anime:reviews:%d:%d", id, page)

	var resp ReviewsResponse
	if err := c.getWithCache(ctx, cacheKey, shortCacheTTL, url, &resp); err != nil {
		return nil, Pagination{}, err
	}

	return resp.Data, resp.Pagination, nil
}
