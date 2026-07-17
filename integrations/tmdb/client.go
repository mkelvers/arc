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
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/sync/errgroup"
	"golang.org/x/sync/singleflight"
)

const (
	defaultBaseURL       = "https://api.themoviedb.org/3"
	defaultImageURL      = "https://image.tmdb.org/t/p"
	maxResponseSize      = 16 << 20
	episodeGroupCacheTTL = 15 * time.Minute
)

type Config struct {
	AccessToken string
}

type Client struct {
	accessToken string
	baseURL     string
	httpClient  *http.Client
	groupMu     sync.Mutex
	groupCache  map[int64]cachedEpisodeGroups
	groupFlight singleflight.Group
}

type cachedEpisodeGroups struct {
	groups    []EpisodeGroup
	expiresAt time.Time
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
		groupCache:  make(map[int64]cachedEpisodeGroups),
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
	season, err := c.GetSeason(ctx, seriesID, seasonNumber, language)
	if err == nil && len(season.Episodes) > 0 {
		return season, nil
	}
	groupSeason, groupErr := c.getEpisodeGroupSeason(ctx, seriesID, seasonNumber)
	if groupErr == nil && len(groupSeason.Episodes) > 0 {
		return groupSeason, nil
	}
	if err != nil {
		return Season{}, err
	}
	return season, nil
}

// GetSeasonMetadataForEpisodeRange resolves an exact mapped episode inventory
// across TMDB episode groups before falling back to the ordinary season.
func (c *Client) GetSeasonMetadataForEpisodeRange(ctx context.Context, seriesID int64, seasonNumber, episodeMin, episodeMax int, language string) (Season, error) {
	return c.GetSeasonMetadataForRelease(ctx, seriesID, SeasonMetadataMatch{
		SeasonNumber: seasonNumber,
		EpisodeMin:   episodeMin,
		EpisodeMax:   episodeMax,
	}, language)
}

// GetSeasonMetadataForRelease resolves the episode inventory that describes a
// release. Mapping season/range values are hints, not authority: imported anime
// mappings can use a different ordering than TMDB's episode groups.
func (c *Client) GetSeasonMetadataForRelease(ctx context.Context, seriesID int64, match SeasonMetadataMatch, language string) (Season, error) {
	groups, err := c.allEpisodeGroups(ctx, seriesID)
	if err == nil {
		if season, ok := bestEpisodeGroupSeason(groups, match); ok {
			return season, nil
		}
	}
	return c.GetSeasonMetadata(ctx, seriesID, match.SeasonNumber, language)
}

func (c *Client) getEpisodeGroupSeason(ctx context.Context, seriesID int64, seasonNumber int) (Season, error) {
	if seasonNumber < 0 {
		return Season{}, fmt.Errorf("tmdb: invalid season number %d", seasonNumber)
	}
	group, err := c.preferredEpisodeGroup(ctx, seriesID)
	if err != nil {
		return Season{}, err
	}
	block, ok := episodeGroupBlockForSeason(group.Groups, seasonNumber)
	if !ok {
		return Season{}, fmt.Errorf("tmdb: season %d episode group block not found", seasonNumber)
	}
	return seasonFromEpisodeBlock(block, seasonNumber), nil
}

func (c *Client) preferredEpisodeGroup(ctx context.Context, seriesID int64) (EpisodeGroup, error) {
	groups, err := c.allEpisodeGroups(ctx, seriesID)
	if err != nil {
		return EpisodeGroup{}, err
	}
	if len(groups) == 0 {
		return EpisodeGroup{}, errors.New("tmdb: episode groups not found")
	}
	return groups[0], nil
}

func (c *Client) allEpisodeGroups(ctx context.Context, seriesID int64) ([]EpisodeGroup, error) {
	if seriesID <= 0 {
		return nil, fmt.Errorf("tmdb: invalid TV series ID %d", seriesID)
	}
	if groups, ok := c.cachedEpisodeGroups(seriesID, time.Now()); ok {
		return groups, nil
	}
	value, err, _ := c.groupFlight.Do(strconv.FormatInt(seriesID, 10), func() (any, error) {
		if groups, ok := c.cachedEpisodeGroups(seriesID, time.Now()); ok {
			return groups, nil
		}
		return c.fetchAllEpisodeGroups(ctx, seriesID)
	})
	if err != nil {
		return nil, err
	}
	groups, ok := value.([]EpisodeGroup)
	if !ok {
		return nil, errors.New("tmdb: invalid cached episode groups")
	}
	return groups, nil
}

func (c *Client) fetchAllEpisodeGroups(ctx context.Context, seriesID int64) ([]EpisodeGroup, error) {
	summaries, err := c.GetEpisodeGroups(ctx, seriesID)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(summaries.Results, func(i, j int) bool {
		return episodeGroupPriority(summaries.Results[i]) < episodeGroupPriority(summaries.Results[j])
	})
	groups, complete := c.fetchEpisodeGroupDetails(ctx, summaries.Results)
	if len(groups) == 0 {
		return nil, errors.New("tmdb: episode group details not found")
	}
	if complete {
		c.groupMu.Lock()
		c.groupCache[seriesID] = cachedEpisodeGroups{groups: groups, expiresAt: time.Now().Add(episodeGroupCacheTTL)}
		c.groupMu.Unlock()
	}
	return groups, nil
}

func (c *Client) fetchEpisodeGroupDetails(ctx context.Context, summaries []EpisodeGroupSummary) ([]EpisodeGroup, bool) {
	results := make([]EpisodeGroup, len(summaries))
	available := make([]bool, len(summaries))
	var requests errgroup.Group
	requests.SetLimit(6)
	for index, summary := range summaries {
		requests.Go(func() error {
			group, err := c.GetEpisodeGroup(ctx, summary.ID)
			if err == nil && len(group.Groups) > 0 {
				results[index], available[index] = group, true
			}
			return nil
		})
	}
	_ = requests.Wait()
	groups := make([]EpisodeGroup, 0, len(results))
	for index, group := range results {
		if available[index] {
			groups = append(groups, group)
		}
	}
	return groups, len(groups) == len(summaries)
}

func (c *Client) cachedEpisodeGroups(seriesID int64, now time.Time) ([]EpisodeGroup, bool) {
	c.groupMu.Lock()
	defer c.groupMu.Unlock()
	cached, ok := c.groupCache[seriesID]
	if !ok || !now.Before(cached.expiresAt) {
		delete(c.groupCache, seriesID)
		return nil, false
	}
	return cached.groups, true
}

func episodeGroupPriority(group EpisodeGroupSummary) int {
	if strings.EqualFold(strings.TrimSpace(group.Name), "Seasons") || group.Type == 7 {
		return 0
	}
	if strings.EqualFold(strings.TrimSpace(group.Name), "No Specials") {
		return 1
	}
	if group.Type == 6 {
		return 2
	}
	if group.Type == 1 {
		return 3
	}
	return 4
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

type episodeBlockMatch struct {
	season    Season
	score     int
	confident bool
}

func bestEpisodeGroupSeason(groups []EpisodeGroup, match SeasonMetadataMatch) (Season, bool) {
	var best episodeBlockMatch
	found := false
	ambiguous := false
	for _, group := range groups {
		for _, block := range group.Groups {
			candidate := matchEpisodeBlock(block, match)
			if !candidate.confident {
				continue
			}
			if !found || candidate.score > best.score {
				best, found, ambiguous = candidate, true, false
				continue
			}
			if candidate.score == best.score && !sameEpisodeInventory(candidate.season.Episodes, best.season.Episodes) {
				ambiguous = true
			}
		}
	}
	return best.season, found && !ambiguous
}

func matchEpisodeBlock(block EpisodeBlock, match SeasonMetadataMatch) episodeBlockMatch {
	season := seasonFromEpisodeGroupBlock(block)
	episodes := season.Episodes
	if len(episodes) == 0 || match.EpisodeCount > 0 && len(episodes) != match.EpisodeCount {
		return episodeBlockMatch{}
	}
	rangeMatch := exactEpisodeRangeMatch(episodes, match)
	dateMatch := episodeDateMatch(episodes, match.FirstAirDate)
	titleMatches, distinctiveTitles := matchingEpisodeTitles(episodes, match.EpisodeTitles)
	seasonMatch := match.SeasonNumber >= 0 && block.Order == match.SeasonNumber
	score := episodeBlockScore(rangeMatch, dateMatch, seasonMatch, match.EpisodeCount > 0, titleMatches)
	confident := rangeMatch || match.EpisodeCount > 0 && (dateMatch || distinctiveTitles >= 2 && titleMatches >= 2)
	return episodeBlockMatch{season: season, score: score, confident: confident}
}

func exactEpisodeRangeMatch(episodes []Episode, match SeasonMetadataMatch) bool {
	if match.EpisodeMin <= 0 || match.EpisodeMax < match.EpisodeMin {
		return false
	}
	minEpisode, maxEpisode := episodeRange(episodes)
	return minEpisode == match.EpisodeMin && maxEpisode == match.EpisodeMax && len(episodes) == match.EpisodeMax-match.EpisodeMin+1
}

func episodeDateMatch(episodes []Episode, firstAirDate string) bool {
	expected := releaseDate(firstAirDate)
	actual := earliestEpisodeAirDate(episodes)
	return expected != "" && actual == expected
}

func episodeBlockScore(rangeMatch, dateMatch, seasonMatch, countMatch bool, titleMatches int) int {
	score := titleMatches * 200
	if rangeMatch {
		score += 200
	}
	if dateMatch {
		score += 1000
	}
	if countMatch {
		score += 100
	}
	if seasonMatch {
		score += 10
	}
	return score
}

func seasonFromEpisodeGroupBlock(block EpisodeBlock) Season {
	episodes := make([]Episode, 0, len(block.Episodes))
	for _, episode := range block.Episodes {
		if episode.SeasonNumber <= 0 || episode.EpisodeNumber <= 0 {
			continue
		}
		episodes = append(episodes, episode)
	}
	sort.SliceStable(episodes, func(i, j int) bool {
		if episodes[i].Order > 0 || episodes[j].Order > 0 {
			return episodes[i].Order < episodes[j].Order
		}
		return episodes[i].EpisodeNumber < episodes[j].EpisodeNumber
	})
	return Season{Episodes: episodes, Name: strings.TrimSpace(block.Name), SeasonNumber: block.Order}
}

func episodeRange(episodes []Episode) (int, int) {
	minEpisode, maxEpisode := 0, 0
	for _, episode := range episodes {
		if minEpisode == 0 || episode.EpisodeNumber < minEpisode {
			minEpisode = episode.EpisodeNumber
		}
		if episode.EpisodeNumber > maxEpisode {
			maxEpisode = episode.EpisodeNumber
		}
	}
	return minEpisode, maxEpisode
}

func earliestEpisodeAirDate(episodes []Episode) string {
	earliest := ""
	for _, episode := range episodes {
		if date := releaseDate(episode.AirDate); date != "" && (earliest == "" || date < earliest) {
			earliest = date
		}
	}
	return earliest
}

func releaseDate(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= len("2006-01-02") {
		return value[:len("2006-01-02")]
	}
	return value
}

func matchingEpisodeTitles(episodes []Episode, titles []string) (int, int) {
	matches, distinctive := 0, 0
	for index, title := range titles {
		normalized := normalizedEpisodeTitle(title)
		if normalized == "" || genericEpisodeTitle(normalized) {
			continue
		}
		distinctive++
		if index < len(episodes) && normalized == normalizedEpisodeTitle(episodes[index].Name) {
			matches++
		}
	}
	return matches, distinctive
}

func normalizedEpisodeTitle(value string) string {
	var normalized strings.Builder
	for _, char := range strings.ToLower(strings.TrimSpace(value)) {
		if unicode.IsLetter(char) || unicode.IsNumber(char) {
			normalized.WriteRune(char)
		}
	}
	return normalized.String()
}

func genericEpisodeTitle(value string) bool {
	for _, prefix := range []string{"episode", "episodio", "folge", "chapter"} {
		if strings.HasPrefix(value, prefix) {
			remainder := strings.TrimPrefix(value, prefix)
			if remainder != "" && strings.Trim(remainder, "0123456789") == "" {
				return true
			}
		}
	}
	return false
}

func sameEpisodeInventory(left, right []Episode) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index].ID > 0 && right[index].ID > 0 {
			if left[index].ID != right[index].ID {
				return false
			}
			continue
		}
		if left[index].EpisodeNumber != right[index].EpisodeNumber || normalizedEpisodeTitle(left[index].Name) != normalizedEpisodeTitle(right[index].Name) {
			return false
		}
	}
	return true
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
