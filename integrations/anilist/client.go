// Package anilist provides the metadata client used by the application.
package anilist

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mal/integrations/metadata"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

type APIError struct {
	Status     int
	Message    string
	Remaining  string
	RetryAfter string
}

func (e *APIError) Error() string {
	if e.Status > 0 {
		return fmt.Sprintf("anilist: HTTP %d: %s", e.Status, e.Message)
	}
	return "anilist: " + e.Message
}

func NewClient(baseURL string) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://graphql.anilist.co"
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), httpClient: &http.Client{Timeout: 15 * time.Second}}
}

func NewClientWithHTTPClient(baseURL string, httpClient *http.Client) *Client {
	client := NewClient(baseURL)
	if httpClient != nil {
		client.httpClient = httpClient
	}
	return client
}

func (c *Client) GetAnimeByMALID(ctx context.Context, id int) (Anime, error) {
	if id <= 0 {
		return Anime{}, fmt.Errorf("anilist: invalid MAL ID %d", id)
	}
	response, err := c.query(ctx, `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { `+fullMediaFields+` } }`, map[string]any{"idMal": id})
	if err != nil {
		return Anime{}, err
	}
	if response.Data.Media == nil {
		return Anime{}, fmt.Errorf("anilist: anime with MAL ID %d not found", id)
	}
	return mapAnime(*response.Data.Media), nil
}

func (c *Client) GetAnimeBatchByMALID(ctx context.Context, ids []int) ([]Anime, error) {
	ids = uniquePositive(ids)
	if len(ids) == 0 {
		return nil, nil
	}
	var query strings.Builder
	query.WriteString("query {")
	for i, id := range ids {
		fmt.Fprintf(&query, "m%d: Media(idMal: %d, type: ANIME) { %s }", i, id, summaryMediaFields)
	}
	query.WriteString("}")
	response, err := c.query(ctx, query.String(), nil)
	if err != nil {
		if !hasBatchData(response) {
			if isNotFoundError(err) {
				return c.getAnimeBatchIndividually(ctx, ids)
			}
			return nil, err
		}
	}
	items := make([]Anime, 0, len(response.Data.Batch))
	for i := range ids {
		item, ok := response.Data.Batch[fmt.Sprintf("m%d", i)]
		if !ok || item.ID == 0 {
			continue
		}
		items = append(items, mapAnime(item))
	}
	return items, nil
}

func (c *Client) getAnimeBatchIndividually(ctx context.Context, ids []int) ([]Anime, error) {
	items := make([]Anime, 0, len(ids))
	for _, id := range ids {
		response, err := c.query(ctx, `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { `+summaryMediaFields+` } }`, map[string]any{"idMal": id})
		if err != nil {
			if isNotFoundError(err) {
				continue
			}
			return nil, err
		}
		if response.Data.Media != nil {
			items = append(items, mapAnime(*response.Data.Media))
		}
	}
	return items, nil
}

func isNotFoundError(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.Status == http.StatusNotFound
}

func (c *Client) Search(ctx context.Context, search string, page, perPage int) (SearchResult, error) {
	if strings.TrimSpace(search) == "" {
		return SearchResult{}, fmt.Errorf("anilist: search term is empty")
	}
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 || perPage > 50 {
		perPage = 20
	}
	response, err := c.query(ctx, `query ($search: String, $page: Int, $perPage: Int) { Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } media(search: $search, type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) { `+summaryMediaFields+` } } }`, map[string]any{"search": search, "page": page, "perPage": perPage})
	if err != nil {
		return SearchResult{}, err
	}
	items := make([]AnimeSummary, 0, len(response.Data.Page.Media))
	for _, item := range response.Data.Page.Media {
		items = append(items, mapSummary(item))
	}
	return SearchResult{Items: items, HasNextPage: response.Data.Page.PageInfo.HasNextPage}, nil
}

func (c *Client) SearchAdvanced(ctx context.Context, search, animeType, status, orderBy, direction string, genres []int, _ int, sfw bool, page, perPage int) (SearchResult, error) {
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 || perPage > 50 {
		perPage = 20
	}

	varDefs := []string{"$page: Int!", "$perPage: Int!", "$sort: [MediaSort!]!"}
	args := []string{"type: ANIME", "sort: $sort"}
	variables := map[string]any{
		"page":    page,
		"perPage": perPage,
		"sort":    []string{mediaSort(orderBy, direction)},
	}
	if search = strings.TrimSpace(search); search != "" {
		varDefs = append(varDefs, "$search: String!")
		args = append(args, "search: $search")
		variables["search"] = search
	}
	if format := nullableMediaFormat(animeType); format != nil {
		varDefs = append(varDefs, "$format: MediaFormat!")
		args = append(args, "format: $format")
		variables["format"] = format
	}
	if mediaStatus := nullableMediaStatus(status); mediaStatus != nil {
		varDefs = append(varDefs, "$status: MediaStatus!")
		args = append(args, "status: $status")
		variables["status"] = mediaStatus
	}
	varDefs, args = addGenreFilter(varDefs, args, variables, genres)
	if sfw {
		args = append(args, "isAdult: false")
	}
	query := fmt.Sprintf("query (%s) { Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } media(%s) { %s } } }", strings.Join(varDefs, ", "), strings.Join(args, ", "), summaryMediaFields)
	response, err := c.query(ctx, query, variables)
	if err != nil {
		return SearchResult{}, err
	}
	items := make([]AnimeSummary, 0, len(response.Data.Page.Media))
	for _, item := range response.Data.Page.Media {
		items = append(items, mapSummary(item))
	}
	return SearchResult{Items: items, HasNextPage: response.Data.Page.PageInfo.HasNextPage}, nil
}

func addGenreFilter(varDefs, args []string, variables map[string]any, genres []int) ([]string, []string) {
	names := make([]string, 0, len(genres))
	for _, id := range genres {
		if name, ok := metadata.GenreName(id); ok {
			names = append(names, name)
		}
	}
	if len(names) == 0 {
		return varDefs, args
	}
	variables["genres"] = names
	return append(varDefs, "$genres: [String!]!"), append(args, "genre_in: $genres")
}

func (c *Client) GetPopular(ctx context.Context, page, perPage int) (CatalogResult, error) {
	return c.catalog(ctx, page, perPage, "", 0)
}

func (c *Client) GetSeason(ctx context.Context, season string, year, page, perPage int) (CatalogResult, error) {
	return c.catalog(ctx, page, perPage, strings.ToUpper(strings.TrimSpace(season)), year)
}

func (c *Client) GetRecommendations(ctx context.Context, id int) ([]Recommendation, error) {
	response, err := c.query(ctx, `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { recommendations(sort: RATING_DESC, perPage: 25) { nodes { rating mediaRecommendation { id idMal type format title { romaji english native userPreferred } startDate { year } coverImage { extraLarge large } } } } } }`, map[string]any{"idMal": id})
	if err != nil {
		return nil, err
	}
	if response.Data.Media == nil {
		return nil, fmt.Errorf("anilist: anime with MAL ID %d not found", id)
	}
	items := make([]Recommendation, 0, len(response.Data.Media.Recommendations.Nodes))
	for _, item := range response.Data.Media.Recommendations.Nodes {
		if item.Media.ID == 0 || item.Media.IDMal == 0 {
			continue
		}
		items = append(items, Recommendation{Anime: mapSummaryFromRelation(item.Media), Votes: item.Rating})
	}
	return items, nil
}

func (c *Client) catalog(ctx context.Context, page, perPage int, season string, year int) (CatalogResult, error) {
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 || perPage > 50 {
		perPage = 20
	}
	query := `query ($page: Int, $perPage: Int, $season: MediaSeason, $year: Int) { Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } media(type: ANIME, isAdult: false, season: $season, seasonYear: $year, sort: [POPULARITY_DESC]) { ` + summaryMediaFields + ` } } }`
	response, err := c.query(ctx, query, map[string]any{"page": page, "perPage": perPage, "season": nullableString(season), "year": nullableInt(year)})
	if err != nil {
		return CatalogResult{}, err
	}
	items := make([]Anime, 0, len(response.Data.Page.Media))
	for _, item := range response.Data.Page.Media {
		items = append(items, mapAnime(item))
	}
	return CatalogResult{Items: items, HasNextPage: response.Data.Page.PageInfo.HasNextPage}, nil
}

//nolint:cyclop // This is the single HTTP/JSON boundary for every AniList operation.
func (c *Client) query(ctx context.Context, query string, variables map[string]any) (apiResponse, error) {
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		return apiResponse{}, fmt.Errorf("anilist: encode request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(body))
	if err != nil {
		return apiResponse{}, fmt.Errorf("anilist: create request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return apiResponse{}, fmt.Errorf("anilist: request: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return apiResponse{}, fmt.Errorf("anilist: read response: %w", err)
	}
	var parsed apiResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return apiResponse{}, fmt.Errorf("anilist: decode response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || len(parsed.Errors) > 0 {
		message := "request failed"
		status := resp.StatusCode
		if len(parsed.Errors) > 0 {
			message = parsed.Errors[0].Message
			if parsed.Errors[0].Status > 0 {
				status = parsed.Errors[0].Status
			}
		}
		return parsed, &APIError{Status: status, Message: message, Remaining: resp.Header.Get("X-RateLimit-Remaining"), RetryAfter: resp.Header.Get("Retry-After")}
	}
	return parsed, nil
}

func hasBatchData(response apiResponse) bool {
	for _, item := range response.Data.Batch {
		if item.ID != 0 && item.IDMal != 0 {
			return true
		}
	}
	return false
}

//nolint:cyclop // Mapping the complete metadata payload is intentionally explicit.
func mapAnime(raw media) Anime {
	updated := time.Time{}
	if raw.UpdatedAt > 0 {
		updated = time.Unix(raw.UpdatedAt, 0).UTC()
	}
	var next *Airing
	if raw.NextAiring != nil {
		next = &Airing{At: time.Unix(raw.NextAiring.AiringAt, 0).UTC(), Episode: raw.NextAiring.Episode}
	}
	result := Anime{ID: raw.ID, MALID: raw.IDMal, Title: raw.Title, Description: raw.Description, Format: raw.Format, Status: raw.Status, StartDate: raw.StartDate, EndDate: raw.EndDate, Season: raw.Season, SeasonYear: raw.SeasonYear, Episodes: raw.Episodes, DurationMinutes: raw.Duration, Country: raw.Country, Source: raw.Source, CoverImage: raw.CoverImage.ExtraLarge, BannerImage: raw.BannerImage, Genres: raw.Genres, Tags: raw.Tags, Synonyms: raw.Synonyms, AverageScore: raw.AverageScore, MeanScore: raw.MeanScore, Popularity: raw.Popularity, Favourites: raw.Favourites, UpdatedAt: updated, IsAdult: raw.IsAdult, NextAiring: next, ExternalLinks: raw.ExternalLinks}
	for _, score := range raw.Stats.ScoreDistribution {
		result.ScoreCount += score.Amount
	}
	for _, ranking := range raw.Rankings {
		switch ranking.Context {
		case "most popular all time":
			result.PopularityRank = ranking.Rank
		case "highest rated all time":
			result.Rank = ranking.Rank
		}
	}
	if result.CoverImage == "" {
		result.CoverImage = raw.CoverImage.Large
	}
	for _, item := range raw.Studios.Nodes {
		result.Studios = append(result.Studios, Studio{ID: item.ID, Name: item.Name, IsMain: true})
	}
	for _, item := range raw.Characters.Edges {
		result.Characters = append(result.Characters, Character{ID: item.Node.ID, Name: item.Node.Name.Full, Role: item.Role, Image: item.Node.Image.Large})
	}
	for _, item := range raw.Staff.Edges {
		result.Staff = append(result.Staff, Staff{ID: item.Node.ID, Name: item.Node.Name.Full, Position: item.Role})
	}
	for _, item := range raw.Relations.Edges {
		result.Relations = append(result.Relations, Relation{Type: item.RelationType, Anime: mapSummaryFromRelation(item.Node)})
	}
	return result
}

func mapSummary(raw media) AnimeSummary {
	return AnimeSummary{ID: raw.ID, MALID: raw.IDMal, Title: raw.Title, Type: raw.Type, Format: raw.Format, StartYear: raw.StartDate.Year, CoverImage: raw.CoverImage.ExtraLarge}
}
func mapSummaryFromRelation(raw mediaSummary) AnimeSummary {
	return AnimeSummary{ID: raw.ID, MALID: raw.IDMal, Title: raw.Title, Type: raw.Type, Format: raw.Format, StartYear: raw.StartDate.Year, CoverImage: raw.CoverImage.ExtraLarge}
}
func uniquePositive(ids []int) []int {
	seen := map[int]bool{}
	out := make([]int, 0, len(ids))
	for _, id := range ids {
		if id > 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullableInt(value int) any {
	if value <= 0 {
		return nil
	}
	return value
}

func nullableMediaFormat(value string) any {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC":
		return strings.ToUpper(strings.TrimSpace(value))
	default:
		return nil
	}
}

func nullableMediaStatus(value string) any {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "airing":
		return "RELEASING"
	case "complete":
		return "FINISHED"
	case "upcoming":
		return "NOT_YET_RELEASED"
	default:
		return nil
	}
}

func mediaSort(orderBy, direction string) string {
	suffix := "_DESC"
	if strings.EqualFold(strings.TrimSpace(direction), "asc") {
		suffix = "_ASC"
	}
	name := "POPULARITY"
	switch strings.ToLower(strings.TrimSpace(orderBy)) {
	case "score":
		name = "SCORE"
	case "title":
		name = "TITLE"
	case "start_date":
		name = "START_DATE"
	case "episodes":
		name = "EPISODES"
	case "popularity":
		name = "POPULARITY"
	}
	return name + suffix
}

var _ = strconv.Itoa

const summaryMediaFields = `id idMal title { romaji english native userPreferred } type format startDate { year } coverImage { extraLarge large }`
const fullMediaFields = `id idMal title { romaji english native userPreferred } description(asHtml: false) type format status startDate { year month day } endDate { year month day } season seasonYear episodes duration countryOfOrigin source coverImage { extraLarge large } bannerImage genres tags { name rank } synonyms averageScore meanScore popularity favourites stats { scoreDistribution { amount } } rankings { rank type context season year } updatedAt isAdult nextAiringEpisode { airingAt episode } studios(isMain: true) { nodes { id name } } characters(perPage: 25) { edges { role node { id name { full } image { large } } } } staff(perPage: 25) { edges { role node { id name { full } } } } relations { edges { relationType node { id idMal type format title { romaji english native userPreferred } startDate { year } coverImage { extraLarge large } } } } externalLinks { site url }`
