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

func (c *Client) Search(ctx context.Context, mediaType MediaType, queryText string, year int) ([]SearchResult, error) {
	if mediaType != MediaTypeTV && mediaType != MediaTypeMovie {
		return nil, fmt.Errorf("tmdb: unsupported media type %q", mediaType)
	}
	queryText = strings.TrimSpace(queryText)
	if queryText == "" {
		return nil, errors.New("tmdb: search query is empty")
	}
	query := make(url.Values)
	query.Set("query", queryText)
	if year > 0 {
		if mediaType == MediaTypeTV {
			query.Set("first_air_date_year", strconv.Itoa(year))
		} else {
			query.Set("year", strconv.Itoa(year))
		}
	}
	var result searchResponse
	err := c.get(ctx, "/search/"+string(mediaType), query, &result)
	for i := range result.Results {
		result.Results[i].Type = mediaType
	}
	return result.Results, err
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

func (c *Client) GetSeasonMetadata(ctx context.Context, seriesID int64, seasonNumber int, language string) (Season, error) {
	groupSeason, groupErr := c.getEpisodeGroupSeason(ctx, seriesID, seasonNumber)
	if groupErr == nil && len(groupSeason.Episodes) > 0 {
		return groupSeason, nil
	}
	season, err := c.GetSeason(ctx, seriesID, seasonNumber, language)
	if err == nil && len(season.Episodes) > 0 {
		return season, nil
	}
	if err != nil {
		return Season{}, err
	}
	return season, nil
}

func (c *Client) getEpisodeGroupSeason(ctx context.Context, seriesID int64, seasonNumber int) (Season, error) {
	if seasonNumber < 0 {
		return Season{}, fmt.Errorf("tmdb: invalid season number %d", seasonNumber)
	}
	groups, err := c.GetEpisodeGroups(ctx, seriesID)
	if err != nil {
		return Season{}, err
	}
	summary, ok := seasonsEpisodeGroup(groups.Results)
	if !ok {
		return Season{}, errors.New("tmdb: seasons episode group not found")
	}
	group, err := c.GetEpisodeGroup(ctx, summary.ID)
	if err != nil {
		return Season{}, err
	}
	block, ok := episodeGroupBlockForSeason(group.Groups, seasonNumber)
	if !ok {
		return Season{}, fmt.Errorf("tmdb: season %d episode group block not found", seasonNumber)
	}
	return seasonFromEpisodeBlock(block, seasonNumber), nil
}

func seasonsEpisodeGroup(groups []EpisodeGroupSummary) (EpisodeGroupSummary, bool) {
	for _, group := range groups {
		if strings.EqualFold(strings.TrimSpace(group.Name), "Seasons") {
			return group, true
		}
	}
	for _, group := range groups {
		if strings.EqualFold(strings.TrimSpace(group.Name), "No Specials") {
			return group, true
		}
	}
	for _, group := range groups {
		if group.Type == 1 {
			return group, true
		}
	}
	return EpisodeGroupSummary{}, false
}

func episodeGroupBlockForSeason(blocks []EpisodeBlock, seasonNumber int) (EpisodeBlock, bool) {
	for _, block := range blocks {
		if block.Order == seasonNumber {
			return block, true
		}
	}
	label := "season " + strconv.Itoa(seasonNumber)
	for _, block := range blocks {
		if strings.EqualFold(strings.TrimSpace(block.Name), label) {
			return block, true
		}
	}
	return EpisodeBlock{}, false
}

func seasonFromEpisodeBlock(block EpisodeBlock, seasonNumber int) Season {
	episodes := make([]Episode, 0, len(block.Episodes))
	for index, episode := range block.Episodes {
		originalSeason := episode.SeasonNumber
		episode.SeasonNumber = seasonNumber
		if originalSeason != seasonNumber || episode.EpisodeNumber <= 0 {
			episode.EpisodeNumber = index + 1
		}
		episodes = append(episodes, episode)
	}
	return Season{
		Episodes:     episodes,
		Name:         strings.TrimSpace(block.Name),
		SeasonNumber: seasonNumber,
	}
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

type searchResponse struct {
	Results []SearchResult `json:"results"`
}
