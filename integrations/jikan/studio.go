package jikan

import (
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

