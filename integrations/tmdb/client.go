// Package tmdb provides a small REST client for TMDB metadata and artwork.
package tmdb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	defaultBaseURL  = "https://api.themoviedb.org/3"
	defaultImageURL = "https://image.tmdb.org/t/p"
	maxResponseSize = 16 << 20
)

type Config struct {
	AccessToken string
}

type Client struct {
	accessToken string
	baseURL     string
	httpClient  *http.Client
}

type APIError struct {
	StatusCode    int
	Code          int    `json:"status_code"`
	StatusMessage string `json:"status_message"`
	Success       bool   `json:"success"`
	RetryAfter    string
}

func (e *APIError) Error() string {
	message := e.StatusMessage
	if message == "" {
		message = "request failed"
	}
	return fmt.Sprintf("tmdb: HTTP %d: %s", e.StatusCode, message)
}

func NewClient(config Config) *Client {
	return &Client{
		accessToken: strings.TrimSpace(config.AccessToken),
		baseURL:     defaultBaseURL,
		httpClient:  &http.Client{Timeout: 15 * time.Second},
	}
}

// GetMedia loads the mapped movie or TV series together with its backdrops and logos.
func (c *Client) GetMedia(ctx context.Context, ref MediaRef, options ImageOptions) (Media, error) {
	if err := validateMediaRef(ref); err != nil {
		return Media{}, err
	}
	var details mediaDetails
	if err := c.get(ctx, "/"+string(ref.Type)+"/"+strconv.FormatInt(ref.ID, 10), nil, &details); err != nil {
		return Media{}, err
	}
	images, err := c.GetImages(ctx, ref, options)
	if err != nil {
		return Media{}, err
	}
	name, originalName := details.Name, details.OriginalName
	if ref.Type == MediaTypeMovie {
		name, originalName = details.Title, details.OriginalTitle
	}
	return Media{
		ID: details.ID, Type: ref.Type, Name: name, OriginalName: originalName,
		Overview: details.Overview, BackdropPath: details.BackdropPath, PosterPath: details.PosterPath,
		Seasons: details.Seasons, Backdrops: images.Backdrops, Logos: images.Logos,
	}, nil
}

func (c *Client) GetImages(ctx context.Context, ref MediaRef, options ImageOptions) (Images, error) {
	if err := validateMediaRef(ref); err != nil {
		return Images{}, err
	}
	query := make(url.Values)
	if language := strings.TrimSpace(options.Language); language != "" {
		query.Set("language", language)
	}
	if len(options.IncludeImageLanguages) > 0 {
		query.Set("include_image_language", strings.Join(options.IncludeImageLanguages, ","))
	}
	var result Images
	err := c.get(ctx, "/"+string(ref.Type)+"/"+strconv.FormatInt(ref.ID, 10)+"/images", query, &result)
	return result, err
}

func (c *Client) GetEpisodeGroups(ctx context.Context, seriesID int64) (EpisodeGroups, error) {
	if seriesID <= 0 {
		return EpisodeGroups{}, fmt.Errorf("tmdb: invalid TV series ID %d", seriesID)
	}
	var result EpisodeGroups
	err := c.get(ctx, "/tv/"+strconv.FormatInt(seriesID, 10)+"/episode_groups", nil, &result)
	return result, err
}

func (c *Client) GetEpisodeGroup(ctx context.Context, groupID string) (EpisodeGroup, error) {
	groupID = strings.TrimSpace(groupID)
	if groupID == "" {
		return EpisodeGroup{}, errors.New("tmdb: episode group ID is empty")
	}
	var result EpisodeGroup
	err := c.get(ctx, "/tv/episode_group/"+url.PathEscape(groupID), nil, &result)
	return result, err
}

func (c *Client) GetSeason(ctx context.Context, seriesID int64, seasonNumber int, language string) (Season, error) {
	if seriesID <= 0 {
		return Season{}, fmt.Errorf("tmdb: invalid TV series ID %d", seriesID)
	}
	if seasonNumber < 0 {
		return Season{}, fmt.Errorf("tmdb: invalid season number %d", seasonNumber)
	}
	query := make(url.Values)
	if language = strings.TrimSpace(language); language != "" {
		query.Set("language", language)
	}
	var result Season
	path := "/tv/" + strconv.FormatInt(seriesID, 10) + "/season/" + strconv.Itoa(seasonNumber)
	err := c.get(ctx, path, query, &result)
	return result, err
}

// ImageURL turns a TMDB file_path into a deliverable image URL. Size can be
// "original" or a supported TMDB image size such as "w780".
func ImageURL(filePath, size string) string {
	filePath = strings.TrimSpace(filePath)
	if filePath == "" {
		return ""
	}
	if size = strings.Trim(strings.TrimSpace(size), "/"); size == "" {
		size = "original"
	}
	return defaultImageURL + "/" + size + "/" + strings.TrimLeft(filePath, "/")
}

func validateMediaRef(ref MediaRef) error {
	if ref.ID <= 0 {
		return fmt.Errorf("tmdb: invalid media ID %d", ref.ID)
	}
	if ref.Type != MediaTypeTV && ref.Type != MediaTypeMovie {
		return fmt.Errorf("tmdb: unsupported media type %q", ref.Type)
	}
	return nil
}

func (c *Client) get(ctx context.Context, path string, query url.Values, destination any) error {
	if c == nil || strings.TrimSpace(c.accessToken) == "" {
		return errors.New("tmdb: TMDB_ACCESS_TOKEN is not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL(c.baseURL, path, query), nil)
	if err != nil {
		return fmt.Errorf("tmdb: create request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.accessToken)
	response, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("tmdb: execute request: %w", err)
	}
	defer response.Body.Close()
	body, err := readResponseBody(response.Body)
	if err != nil {
		return err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		var apiError APIError
		_ = json.Unmarshal(body, &apiError)
		apiError.StatusCode = response.StatusCode
		apiError.RetryAfter = response.Header.Get("Retry-After")
		return &apiError
	}
	if err := json.Unmarshal(body, destination); err != nil {
		return fmt.Errorf("tmdb: decode response: %w", err)
	}
	return nil
}

func requestURL(baseURL, path string, query url.Values) string {
	endpoint := strings.TrimRight(baseURL, "/") + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	return endpoint
}

func readResponseBody(body io.Reader) ([]byte, error) {
	raw, err := io.ReadAll(io.LimitReader(body, maxResponseSize+1))
	if err != nil {
		return nil, fmt.Errorf("tmdb: read response: %w", err)
	}
	if len(raw) > maxResponseSize {
		return nil, errors.New("tmdb: response exceeds size limit")
	}
	return raw, nil
}

type mediaDetails struct {
	ID            int64           `json:"id"`
	Name          string          `json:"name"`
	OriginalName  string          `json:"original_name"`
	Title         string          `json:"title"`
	OriginalTitle string          `json:"original_title"`
	Overview      string          `json:"overview"`
	BackdropPath  string          `json:"backdrop_path"`
	PosterPath    string          `json:"poster_path"`
	Seasons       []SeasonSummary `json:"seasons"`
}
