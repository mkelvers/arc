package jikan

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// GetEpisodes returns episode list for a specific page.
func (c *Client) GetEpisodes(ctx context.Context, animeID int, page int) (EpisodesResponse, error) {
	if page < 1 {
		page = 1
	}

	cacheKey := fmt.Sprintf("anime:%d:episodes:%d", animeID, page)
	var result EpisodesResponse
	reqURL := fmt.Sprintf("%s/anime/%d/episodes?page=%d", c.baseURL, animeID, page)

	err := c.getWithCache(ctx, cacheKey, 12*time.Hour, reqURL, &result)
	return result, err
}

// GetAllEpisodes fetches all pages of episodes in parallel and flattens results.
func (c *Client) GetAllEpisodes(ctx context.Context, animeID int) ([]Episode, error) {
	// First page to get total pages
	first, err := c.GetEpisodes(ctx, animeID, 1)
	if err != nil {
		return nil, err
	}

	if first.Pagination.LastVisiblePage <= 1 {
		return first.Data, nil
	}

	all := make([][]Episode, first.Pagination.LastVisiblePage)
	all[0] = first.Data

	var wg sync.WaitGroup
	errs := make(chan error, first.Pagination.LastVisiblePage-1)

	// Fetch remaining pages in parallel
	// Note: Client.getWithCache handles rate limiting (3 req/sec)
	for p := 2; p <= first.Pagination.LastVisiblePage; p++ {
		wg.Add(1)
		go func(page int) {
			defer wg.Done()
			resp, err := c.GetEpisodes(ctx, animeID, page)
			if err != nil {
				errs <- err
				return
			}
			all[page-1] = resp.Data
		}(p)
	}

	wg.Wait()
	close(errs)

	if err := <-errs; err != nil {
		return nil, err
	}

	var result []Episode
	for _, pageData := range all {
		result = append(result, pageData...)
	}

	return result, nil
}

