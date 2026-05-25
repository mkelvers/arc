package jikan

import (
	"context"
	"fmt"
)

type ProducerResponse struct {
	Data struct {
		MalID  int `json:"mal_id"`
		Titles []struct {
			Type  string `json:"type"`
			Title string `json:"title"`
		} `json:"titles"`
		Images struct {
			Jpg struct {
				ImageURL string `json:"image_url"`
			} `json:"jpg"`
		} `json:"images"`
		Favorites   int    `json:"favorites"`
		Established string `json:"established"`
		About       string `json:"about"`
		Count       int    `json:"count"`
		External    []struct {
			Name string `json:"name"`
			URL  string `json:"url"`
		} `json:"external"`
	} `json:"data"`
}

func (c *Client) GetProducerByID(ctx context.Context, id int) (ProducerResponse, error) {
	if id <= 0 {
		return ProducerResponse{}, fmt.Errorf("invalid producer id")
	}

	cacheKey := fmt.Sprintf("producer:%d", id)
	reqURL := fmt.Sprintf("%s/producers/%d", c.baseURL, id)

	var result ProducerResponse
	if err := c.getWithCache(ctx, cacheKey, producerCacheTTL, reqURL, &result); err != nil {
		return ProducerResponse{}, err
	}
	return result, nil
}
