// Package watchorder provides anime watch order data from various sources.
package watchorder

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	errlog "mal/pkg"
	netutil "mal/pkg/net"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// idPattern extracts the watch order ID from chiaki.site URLs
var idPattern = regexp.MustCompile(`/id/(\d+)`)

// malLinkPattern extracts MAL IDs from watch order entries
var malLinkPattern = regexp.MustCompile(`myanimelist\.net/anime/(\d+)`)

var ErrInvalidWatchOrderURL = errors.New("invalid watch order url")
var ErrWatchOrderMarkupNotFound = errors.New("watch order markup not found")
var ErrWatchOrderNotFound = errors.New("watch order not found")

type HTTPStatusError struct {
	StatusCode  int
	URL         string
	Server      string
	CFRay       string
	Location    string
	ContentType string
	BodyPreview string
}

func (e *HTTPStatusError) Error() string {
	return fmt.Sprintf(
		"unexpected status code: %d (url=%s server=%s cf_ray=%s location=%s content_type=%s body=%q)",
		e.StatusCode,
		e.URL,
		e.Server,
		e.CFRay,
		e.Location,
		e.ContentType,
		e.BodyPreview,
	)
}

type WatchOrderEntry struct {
	ID           int            `json:"id"`                   // MAL anime ID
	AniListID    int            `json:"anilist_id,omitempty"` // AniList anime ID when available
	Type         string         `json:"type"`                 // anime type label (e.g. "TV", "Movie")
	Title        string         `json:"title"`                // primary title
	TitleAlt     string         `json:"title_alt,omitempty"`  // alternative title
	Episodes     int            `json:"episodes,omitempty"`
	DurationSecs int            `json:"duration_seconds,omitempty"`
	AirDate      string         `json:"air_date,omitempty"`
	Secondary    bool           `json:"secondary,omitempty"`
	Relations    map[int]string `json:"relations,omitempty"`
}

type WatchOrderResult struct {
	ID         int               `json:"id"`
	WatchOrder []WatchOrderEntry `json:"watch_order"`
}

type watchOrderRow struct {
	id               int
	aniListID        int
	typeID           int
	title            string
	alternativeTitle string
	episodes         int
	durationSecs     int
	airDate          string
	secondary        bool
	relations        map[int]string
}

func parseRootID(url string) (int, error) {
	match := idPattern.FindStringSubmatch(url)
	if len(match) != 2 {
		return 0, ErrInvalidWatchOrderURL
	}

	id, err := strconv.Atoi(match[1])
	if err != nil {
		return 0, ErrInvalidWatchOrderURL
	}

	return id, nil
}

func addCommonHeaders(request *http.Request) {
	netutil.SetBrowserHTMLHeaders(request, "https://chiaki.site/")
}

func fetchDocument(ctx context.Context, httpClient *http.Client, url string) (*goquery.Document, error) {
	document, _, err := netutil.FetchHTMLDocument(ctx, httpClient, url, addCommonHeaders, func(response *http.Response, body []byte) error {
		return &HTTPStatusError{
			StatusCode:  response.StatusCode,
			URL:         url,
			Server:      strings.TrimSpace(response.Header.Get("Server")),
			CFRay:       strings.TrimSpace(response.Header.Get("CF-Ray")),
			Location:    strings.TrimSpace(response.Header.Get("Location")),
			ContentType: strings.TrimSpace(response.Header.Get("Content-Type")),
			BodyPreview: strings.Join(strings.Fields(strings.TrimSpace(string(body))), " "),
		}
	})
	return document, err
}

func extractTypeLabelsByID(doc *goquery.Document) map[int]string {
	typeLabels := make(map[int]string)

	doc.Find("#wo_type_filter label").Each(func(_ int, selection *goquery.Selection) {
		input := selection.Find("input[type='checkbox']")
		rawID, exists := input.Attr("value")
		if !exists {
			return
		}

		typeID, err := strconv.Atoi(strings.TrimSpace(rawID))
		if err != nil {
			return
		}

		label := strings.TrimSpace(selection.Text())
		if label == "" {
			return
		}

		typeLabels[typeID] = label
	})

	return typeLabels
}

func parseAttrInt(selection *goquery.Selection, attrName string) (int, bool) {
	rawValue, exists := selection.Attr(attrName)
	if !exists {
		return 0, false
	}

	value, err := strconv.Atoi(strings.TrimSpace(rawValue))
	if err != nil {
		return 0, false
	}

	return value, true
}

func extractRows(doc *goquery.Document) []watchOrderRow {
	rows := make([]watchOrderRow, 0)

	doc.Find("tr[data-id]").Each(func(_ int, selection *goquery.Selection) {
		id, ok := parseAttrInt(selection, "data-id")
		if !ok {
			return
		}

		typeID, ok := parseAttrInt(selection, "data-type")
		if !ok {
			return
		}

		title := strings.TrimSpace(selection.Find(".wo_title").First().Text())
		alt := strings.TrimSpace(selection.Find(".uk-text-small").First().Text())
		aniListID, _ := parseAttrInt(selection, "data-anilist-id")
		episodes, _ := parseAttrInt(selection, "data-eps")
		durationSecs, _ := parseAttrInt(selection, "data-duration")
		meta := strings.TrimSpace(selection.Find(".wo_meta").First().Text())
		airDate := meta
		if parts := strings.SplitN(meta, "|", 2); len(parts) > 0 {
			airDate = strings.TrimSpace(parts[0])
		}
		var related map[string]string
		_ = json.Unmarshal([]byte(selection.AttrOr("data-related", "{}")), &related)
		relations := make(map[int]string, len(related))
		for rawID, relation := range related {
			relatedID, err := strconv.Atoi(rawID)
			if err == nil && relatedID > 0 {
				relations[relatedID] = relation
			}
		}

		rows = append(rows, watchOrderRow{
			id:               id,
			aniListID:        aniListID,
			typeID:           typeID,
			title:            title,
			alternativeTitle: alt,
			episodes:         episodes,
			durationSecs:     durationSecs,
			airDate:          airDate,
			secondary:        selection.HasClass("wo_row_secondary"),
			relations:        relations,
		})
	})

	return rows
}

// shouldTryProxy returns true for transient errors where the Jina proxy may help
// (e.g. Cloudflare blocking, rate limits)
func shouldTryProxy(err error) bool {
	var statusError *HTTPStatusError
	if errors.As(err, &statusError) {
		return statusError.StatusCode == http.StatusForbidden || statusError.StatusCode == http.StatusTooManyRequests || statusError.StatusCode == http.StatusServiceUnavailable
	}

	return false
}

func toJinaProxyURL(url string) string {
	trimmed := strings.TrimPrefix(strings.TrimPrefix(url, "https://"), "http://")
	return "https://r.jina.ai/http://" + trimmed
}

func fetchProxyText(ctx context.Context, httpClient *http.Client, url string) (string, error) {
	client := httpClient
	if client == nil {
		client = http.DefaultClient
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, toJinaProxyURL(url), nil)
	if err != nil {
		return "", fmt.Errorf("failed to create proxy request: %w", err)
	}

	addCommonHeaders(request)

	response, err := client.Do(request)
	if err != nil {
		return "", fmt.Errorf("proxy request failed: %w", err)
	}
	defer func() {
		errlog.Log("failed to close watch order proxy response body", response.Body.Close())
	}()

	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("proxy status %d", response.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, netutil.MiB2))
	if err != nil {
		return "", fmt.Errorf("failed to read proxy response: %w", err)
	}

	return string(body), nil
}

// parseJinaEntries parses Jina proxy output, which contains one line per entry
// in format: "title | type | https://myanimelist.net/anime/ID"
func parseJinaEntries(text string) []WatchOrderEntry {
	lines := strings.Split(text, "\n")
	entries := make([]WatchOrderEntry, 0)
	seen := make(map[int]bool)

	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		if !strings.Contains(trimmed, "myanimelist.net/anime/") || !strings.Contains(trimmed, "|") {
			continue
		}

		idMatch := malLinkPattern.FindStringSubmatch(trimmed)
		if len(idMatch) != 2 {
			continue
		}

		id, err := strconv.Atoi(idMatch[1])
		if err != nil || seen[id] {
			continue
		}

		parts := strings.Split(trimmed, "|")
		if len(parts) < 2 {
			continue
		}

		typeName := strings.TrimSpace(parts[1])
		if typeName == "" {
			continue
		}

		title, titleAlt := titleFromContext(lines, index)
		entries = append(entries, WatchOrderEntry{
			ID:       id,
			Type:     typeName,
			Title:    title,
			TitleAlt: titleAlt,
		})
		seen[id] = true
	}

	return entries
}

func isNoiseTitleLine(value string) bool {
	lower := strings.ToLower(strings.TrimSpace(value))
	if lower == "" {
		return true
	}

	if strings.HasPrefix(lower, "title:") || strings.HasPrefix(lower, "url source:") || strings.HasPrefix(lower, "markdown content:") {
		return true
	}

	if strings.Contains(lower, "/ watch order") {
		return true
	}

	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return true
	}

	return false
}

// titleFromContext looks backward from metaIndex to find the actual title lines.
// It skips noise lines (URLs, metadata prefixes, etc.) and returns (primary, alt).
func titleFromContext(lines []string, metaIndex int) (string, string) {
	collected := make([]string, 0, 2)

	for idx := metaIndex - 1; idx >= 0 && len(collected) < 2; idx-- {
		candidate := strings.TrimSpace(lines[idx])
		if candidate == "" {
			continue
		}

		if isNoiseTitleLine(candidate) {
			continue
		}

		if strings.Contains(candidate, "myanimelist.net/anime/") {
			continue
		}

		collected = append(collected, candidate)
	}

	if len(collected) == 0 {
		return "", ""
	}

	if len(collected) == 1 {
		return collected[0], ""
	}

	// reversed order: older lines first -> title, newer -> alt
	return collected[1], collected[0]
}

func fetchViaProxy(ctx context.Context, httpClient *http.Client, url string, rootID int) (WatchOrderResult, error) {
	proxyText, err := fetchProxyText(ctx, httpClient, url)
	if err != nil {
		return WatchOrderResult{}, err
	}

	entries := parseJinaEntries(proxyText)
	if len(entries) == 0 {
		return WatchOrderResult{}, ErrWatchOrderMarkupNotFound
	}

	return WatchOrderResult{ID: rootID, WatchOrder: entries}, nil
}

// FetchWatchOrder fetches the watch order from chiaki.site.
// Falls back to the Jina proxy if the site is blocked or returns an empty table.
func FetchWatchOrder(ctx context.Context, httpClient *http.Client, url string) (WatchOrderResult, error) {
	rootID, err := parseRootID(url)
	if err != nil {
		return WatchOrderResult{}, err
	}

	doc, err := fetchDocument(ctx, httpClient, url)
	if err != nil {
		if shouldTryProxy(err) {
			return fetchViaProxy(ctx, httpClient, url, rootID)
		}
		return WatchOrderResult{}, err
	}

	// empty table indicates JS-rendered content; need proxy
	if doc.Find("#wo_list").Length() == 0 {
		return fetchViaProxy(ctx, httpClient, url, rootID)
	}

	rows := extractRows(doc)
	if len(rows) == 0 {
		return WatchOrderResult{ID: rootID, WatchOrder: []WatchOrderEntry{}}, nil
	}

	typeByID := extractTypeLabelsByID(doc)

	entries := make([]WatchOrderEntry, 0, len(rows))
	for _, row := range rows {
		typeName := strings.TrimSpace(typeByID[row.typeID])

		entries = append(entries, WatchOrderEntry{
			ID:           row.id,
			AniListID:    row.aniListID,
			Type:         typeName,
			Title:        row.title,
			TitleAlt:     row.alternativeTitle,
			Episodes:     row.episodes,
			DurationSecs: row.durationSecs,
			AirDate:      row.airDate,
			Secondary:    row.secondary,
			Relations:    row.relations,
		})
	}

	return WatchOrderResult{ID: rootID, WatchOrder: entries}, nil
}
