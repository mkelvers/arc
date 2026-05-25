package jikan

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

type ProducerListEntry struct {
	MalID  int `json:"mal_id"`
	Titles []struct {
		Type  string `json:"type"`
		Title string `json:"title"`
	} `json:"titles"`
}

type ProducersResponse struct {
	Data       []ProducerListEntry `json:"data"`
	Pagination Pagination          `json:"pagination"`
}

type ProducerListResult struct {
	Items       []ProducerListEntry
	HasNextPage bool
}

func (c *Client) GetProducers(ctx context.Context, query string, page int, limit int) (ProducerListResult, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 1
	}

	q := strings.TrimSpace(query)
	if q == "" {
		return c.fetchProducersPage(ctx, "", page, limit)
	}

	result, err := c.fetchProducersPage(ctx, q, page, limit)
	if err == nil {
		return result, nil
	}

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		return ProducerListResult{}, err
	}

	return c.searchProducersFromPages(ctx, q, page, limit)
}

func (c *Client) fetchProducersPage(ctx context.Context, query string, page int, limit int) (ProducerListResult, error) {
	q := strings.TrimSpace(query)
	cacheKey := fmt.Sprintf("producers:%s:%d:%d", q, page, limit)
	reqURL := fmt.Sprintf("%s/producers?page=%d&limit=%d", c.baseURL, page, limit)
	if q != "" {
		reqURL += "&q=" + url.QueryEscape(q)
	}

	var result ProducersResponse
	if err := c.getWithCache(ctx, cacheKey, producerCacheTTL, reqURL, &result); err != nil {
		return ProducerListResult{}, err
	}

	return ProducerListResult{
		Items:       result.Data,
		HasNextPage: result.Pagination.HasNextPage,
	}, nil
}

func (c *Client) searchProducersFromPages(ctx context.Context, query string, page int, limit int) (ProducerListResult, error) {
	const maxPagesToScan = 25

	needle := strings.ToLower(strings.TrimSpace(query))
	startIndex := (page - 1) * limit
	endIndex := startIndex + limit

	matches := make([]ProducerListEntry, 0, endIndex)
	scannedAll := false

	for currentPage := 1; currentPage <= maxPagesToScan; currentPage++ {
		result, err := c.fetchProducersPage(ctx, "", currentPage, limit)
		if err != nil {
			return ProducerListResult{}, err
		}

		for _, item := range result.Items {
			name := strings.ToLower(ProducerListEntryName(item))
			if strings.Contains(name, needle) {
				matches = append(matches, item)
			}
		}

		if len(matches) >= endIndex {
			return ProducerListResult{
				Items:       matches[startIndex:endIndex],
				HasNextPage: len(matches) > endIndex || result.HasNextPage,
			}, nil
		}

		if !result.HasNextPage {
			scannedAll = true
			break
		}
	}

	if startIndex >= len(matches) {
		return ProducerListResult{
			Items:       []ProducerListEntry{},
			HasNextPage: !scannedAll,
		}, nil
	}

	if endIndex > len(matches) {
		endIndex = len(matches)
	}

	return ProducerListResult{
		Items:       matches[startIndex:endIndex],
		HasNextPage: !scannedAll,
	}, nil
}

func ProducerListEntryName(entry ProducerListEntry) string {
	for _, t := range entry.Titles {
		if t.Title != "" {
			return t.Title
		}
	}
	if entry.MalID > 0 {
		return strconv.Itoa(entry.MalID)
	}
	return ""
}
