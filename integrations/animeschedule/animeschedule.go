// Package animeschedule provides an integration with the animeschedule.net API.
package animeschedule

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	netutil "mal/pkg/net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

type AirType string

const (
	AirTypeJPN AirType = "JPN"
	AirTypeSUB AirType = "SUB"
	AirTypeDUB AirType = "DUB"
)

type Entry struct {
	Title       string
	AnimeURL    string
	ImageURL    string
	EpisodeText string
	AirType     AirType
	AirsAt      time.Time
	LocalTime   string
	DateLabel   string
	Weekday     time.Weekday
}

type WeekSchedule struct {
	Year int
	Week int
	Days map[time.Weekday][]Entry
}

type HTTPStatusError struct {
	StatusCode  int
	URL         string
	ContentType string
	BodyPreview string
}

func (e *HTTPStatusError) Error() string {
	return fmt.Sprintf("unexpected status %d for %s", e.StatusCode, e.URL)
}

var reWeek = regexp.MustCompile(`(?i)[?&]week=(\d+)`)
var reYear = regexp.MustCompile(`(?i)[?&]year=(\d+)`)

func scheduleLocation(timezone string) (*time.Location, error) {
	timezone = strings.TrimSpace(timezone)
	if timezone == "" {
		timezone = "UTC"
	}
	location, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("load schedule timezone %q: %w", timezone, err)
	}
	return location, nil
}

func FetchWeek(ctx context.Context, httpClient *http.Client, year int, week int, timezone string) (WeekSchedule, error) {
	apiToken := strings.TrimSpace(os.Getenv("ANIMESCHEDULE_API_TOKEN"))

	if apiToken != "" {
		return fetchWeekAPI(ctx, httpClient, apiToken, year, week, timezone)
	}

	location, err := scheduleLocation(timezone)
	if err != nil {
		return WeekSchedule{}, err
	}

	doc, finalURL, err := fetchDocument(ctx, httpClient, buildWeekURL(year, week))
	if err != nil {
		return WeekSchedule{}, err
	}

	return scrapeWeekSchedule(doc, finalURL, year, week, location), nil
}

func buildWeekURL(year int, week int) string {
	u, _ := url.Parse("https://animeschedule.net/")
	q := u.Query()
	if year > 0 {
		q.Set("year", strconv.Itoa(year))
	}
	if week > 0 {
		q.Set("week", strconv.Itoa(week))
	}
	u.RawQuery = q.Encode()
	return u.String()
}

func scrapeWeekSchedule(doc *goquery.Document, finalURL string, year int, week int, location *time.Location) WeekSchedule {
	resolvedYear, resolvedWeek := resolveWeekFromFinalURL(finalURL, year, week)
	out := WeekSchedule{
		Year: resolvedYear,
		Week: resolvedWeek,
		Days: map[time.Weekday][]Entry{},
	}

	doc.Find(".timetable-column").Each(func(_ int, column *goquery.Selection) {
		weekday, dayEntries, ok := scrapeDayColumn(column, location)
		if !ok {
			return
		}

		out.Days[weekday] = append(out.Days[weekday], preferredReleaseEntries(dayEntries)...)
	})

	return out
}

func resolveWeekFromFinalURL(finalURL string, year int, week int) (int, int) {
	resolvedYear := year
	resolvedWeek := week
	if resolvedWeek == 0 {
		resolvedWeek = parseIntFromURLMatch(reWeek, finalURL)
	}
	if resolvedYear == 0 {
		resolvedYear = parseIntFromURLMatch(reYear, finalURL)
	}
	return resolvedYear, resolvedWeek
}

func parseIntFromURLMatch(pattern *regexp.Regexp, rawURL string) int {
	match := pattern.FindStringSubmatch(rawURL)
	if len(match) != 2 {
		return 0
	}

	value, err := strconv.Atoi(match[1])
	if err != nil {
		return 0
	}

	return value
}

func scrapeDayColumn(column *goquery.Selection, location *time.Location) (time.Weekday, []Entry, bool) {
	rawHeader := strings.Join(strings.Fields(strings.TrimSpace(column.Find("h1.timetable-column-date").First().Text())), " ")
	weekday := parseWeekdayFromHeader(rawHeader)
	if weekday == nil {
		return time.Sunday, nil, false
	}

	dayEntries := make([]Entry, 0, 16)
	column.Find(".timetable-column-show").Each(func(_ int, show *goquery.Selection) {
		entry, ok := scrapeShowEntry(show, rawHeader, *weekday, location)
		if !ok {
			return
		}

		dayEntries = append(dayEntries, entry)
	})
	if len(dayEntries) == 0 {
		return time.Sunday, nil, false
	}

	return *weekday, dayEntries, true
}

func scrapeShowEntry(show *goquery.Selection, rawHeader string, weekday time.Weekday, location *time.Location) (Entry, bool) {
	if selectionHasClass(show, "filtered-out") {
		return Entry{}, false
	}

	a := show.Find("a.show-link").First()
	title := strings.TrimSpace(a.Find("h2").First().Text())
	if title == "" {
		title = strings.TrimSpace(a.Text())
	}

	href, _ := a.Attr("href")
	animeURL := absolutizeURL("https://animeschedule.net", href)
	if title == "" || animeURL == "" {
		return Entry{}, false
	}

	meta := show.Find("h3.time-bar").First()
	metaText := strings.Join(strings.Fields(strings.TrimSpace(meta.Text())), " ")
	epText, _, airType := parseMeta(metaText)
	localTime, airsAt, _ := parseLocalTime(meta, location)
	if localTime == "" || airType != AirTypeSUB {
		return Entry{}, false
	}

	return Entry{
		Title:       title,
		AnimeURL:    animeURL,
		ImageURL:    extractShowImageURL(a),
		EpisodeText: epText,
		AirType:     airType,
		AirsAt:      airsAt,
		LocalTime:   localTime,
		DateLabel:   rawHeader,
		Weekday:     weekday,
	}, true
}

func extractShowImageURL(link *goquery.Selection) string {
	img := link.Find("img").First()
	if img == nil || img.Length() != 1 {
		return ""
	}

	if src, ok := img.Attr("data-src"); ok {
		if trimmed := strings.TrimSpace(src); trimmed != "" {
			return trimmed
		}
	}

	src, ok := img.Attr("src")
	if !ok || strings.HasPrefix(src, "data:") {
		return ""
	}

	return strings.TrimSpace(src)
}

func selectionHasClass(selection *goquery.Selection, className string) bool {
	raw, ok := selection.Attr("class")
	if !ok {
		return false
	}
	return slices.Contains(strings.Fields(raw), className)
}

func parseWeekdayFromHeader(header string) *time.Weekday {
	lower := strings.ToLower(header)
	candidates := []struct {
		key string
		val time.Weekday
	}{
		{"monday", time.Monday},
		{"tuesday", time.Tuesday},
		{"wednesday", time.Wednesday},
		{"thursday", time.Thursday},
		{"friday", time.Friday},
		{"saturday", time.Saturday},
		{"sunday", time.Sunday},
	}
	for _, c := range candidates {
		if strings.Contains(lower, c.key) {
			v := c.val
			return &v
		}
	}
	return nil
}

func parseMeta(meta string) (episodeText string, localTime string, airType AirType) {
	// Example: "Ep 8 04:00 PM SUB"
	parts := strings.Fields(meta)
	if len(parts) < 4 {
		return "", "", ""
	}

	// Find the time token(s)
	var timeIdx = -1
	for i := range parts {
		if strings.Contains(parts[i], ":") && len(parts[i]) >= 4 {
			timeIdx = i
			break
		}
	}
	if timeIdx == -1 || timeIdx+2 >= len(parts) {
		return "", "", ""
	}

	localTime = strings.TrimSpace(parts[timeIdx] + " " + parts[timeIdx+1])
	airType, ok := parseAirType(parts[timeIdx+2])
	if !ok {
		return "", "", ""
	}

	episodeText = strings.TrimSpace(strings.Join(parts[:timeIdx], " "))
	return episodeText, localTime, airType
}

func parseAirType(raw string) (AirType, bool) {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "JPN":
		return AirTypeJPN, true
	case "SUB":
		return AirTypeSUB, true
	case "DUB":
		return AirTypeDUB, true
	default:
		return "", false
	}
}

func preferredReleaseEntries(entries []Entry) []Entry {
	type keyedEntry struct {
		index int
		entry Entry
	}

	selected := map[string]keyedEntry{}
	for i, entry := range entries {
		key := entry.AnimeURL + "\x00" + entry.EpisodeText
		current, ok := selected[key]
		if !ok || airTypePriority(entry.AirType) > airTypePriority(current.entry.AirType) {
			selected[key] = keyedEntry{index: i, entry: entry}
		}
	}

	out := make([]keyedEntry, 0, len(selected))
	for _, entry := range selected {
		out = append(out, entry)
	}
	slices.SortFunc(out, func(a keyedEntry, b keyedEntry) int {
		return a.index - b.index
	})

	preferred := make([]Entry, 0, len(out))
	for _, entry := range out {
		preferred = append(preferred, entry.entry)
	}
	return preferred
}

func airTypePriority(airType AirType) int {
	switch airType {
	case AirTypeSUB:
		return 3
	case AirTypeDUB:
		return 2
	case AirTypeJPN:
		return 1
	default:
		return 0
	}
}

func parseLocalTime(meta *goquery.Selection, location *time.Location) (localTime string, airsAt time.Time, rawRenderedTime string) {
	// AnimeSchedule updates rendered time client-side based on the viewer's timezone.
	// The server-rendered HTML can show a different time string, so we prefer the `datetime`
	// attribute when available.
	t := meta.Find("time").First()
	if t.Length() == 1 {
		rawRenderedTime = strings.Join(strings.Fields(strings.TrimSpace(t.Text())), " ")
		if raw, ok := t.Attr("datetime"); ok {
			if parsed, err := parseScheduleDatetime(raw); err == nil {
				airsAt = parsed.In(location)
				localTime = airsAt.Format("15:04")
				return localTime, airsAt, rawRenderedTime
			}
		}
	}

	fallback := strings.Join(strings.Fields(strings.TrimSpace(meta.Text())), " ")
	_, parsedTime, _ := parseMeta(fallback)
	return parsedTime, time.Time{}, ""
}

func parseScheduleDatetime(value string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04Z07:00"} {
		parsed, err := time.Parse(layout, strings.TrimSpace(value))
		if err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, fmt.Errorf("parse schedule datetime %q", value)
}

func absolutizeURL(base string, href string) string {
	href = strings.TrimSpace(href)
	if href == "" {
		return ""
	}
	if strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		return href
	}
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(href, "/")
}

func addCommonHeaders(request *http.Request) {
	netutil.SetBrowserHTMLHeaders(request, "https://animeschedule.net/")
}

func fetchDocument(ctx context.Context, httpClient *http.Client, url string) (*goquery.Document, string, error) {
	document, finalURL, err := netutil.FetchHTMLDocument(ctx, httpClient, url, addCommonHeaders, func(response *http.Response, body []byte) error {
		return &HTTPStatusError{
			StatusCode:  response.StatusCode,
			URL:         url,
			ContentType: strings.TrimSpace(response.Header.Get("Content-Type")),
			BodyPreview: strings.Join(strings.Fields(strings.TrimSpace(string(body))), " "),
		}
	})
	if err != nil {
		return nil, finalURL, err
	}

	return document, finalURL, nil
}

type timetableAnimeAPI struct {
	Title                   string    `json:"title"`
	English                 string    `json:"english"`
	Route                   string    `json:"route"`
	EpisodeDate             time.Time `json:"episodeDate"`
	EpisodeNumber           int       `json:"episodeNumber"`
	SubtractedEpisodeNumber int       `json:"subtractedEpisodeNumber"`
	AirType                 string    `json:"airType"`
	ImageVersionRoute       string    `json:"imageVersionRoute"`
}

func fetchWeekAPI(ctx context.Context, httpClient *http.Client, token string, year int, week int, timezone string) (WeekSchedule, error) {
	client := httpClient
	if client == nil {
		client = http.DefaultClient
	}

	location, err := scheduleLocation(timezone)
	if err != nil {
		return WeekSchedule{}, err
	}

	payload, err := fetchWeekAPIPayload(ctx, client, token, year, week, location)
	if err != nil {
		return WeekSchedule{}, err
	}

	resolvedYear, resolvedWeek := resolveRequestedISOWeek(year, week)
	out := WeekSchedule{
		Year: resolvedYear,
		Week: resolvedWeek,
		Days: map[time.Weekday][]Entry{},
	}

	for _, item := range payload {
		entry, ok := weekEntryFromAPI(item, location)
		if !ok {
			continue
		}

		out.Days[entry.Weekday] = append(out.Days[entry.Weekday], entry)
	}

	return out, nil
}

func fetchWeekAPIPayload(ctx context.Context, client *http.Client, token string, year int, week int, location *time.Location) ([]timetableAnimeAPI, error) {

	u, _ := url.Parse("https://animeschedule.net/api/v3/timetables/sub")
	q := u.Query()
	if year > 0 && week > 0 {
		q.Set("year", strconv.Itoa(year))
		q.Set("week", strconv.Itoa(week))
	}
	q.Set("tz", location.String())
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create api request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", netutil.Chrome135)

	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("api request failed: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, netutil.Bytes512))
		return nil, &HTTPStatusError{
			StatusCode:  res.StatusCode,
			URL:         u.String(),
			ContentType: strings.TrimSpace(res.Header.Get("Content-Type")),
			BodyPreview: strings.Join(strings.Fields(strings.TrimSpace(string(body))), " "),
		}
	}

	var payload []timetableAnimeAPI
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode timetables api: %w", err)
	}

	return payload, nil
}

func resolveRequestedISOWeek(year int, week int) (int, int) {
	if year > 0 && week > 0 {
		return year, week
	}

	return time.Now().In(time.Local).ISOWeek()
}

func weekEntryFromAPI(item timetableAnimeAPI, location *time.Location) (Entry, bool) {
	title := strings.TrimSpace(item.English)
	if title == "" {
		title = strings.TrimSpace(item.Title)
	}
	if title == "" {
		return Entry{}, false
	}

	airType := AirType(strings.ToUpper(strings.TrimSpace(item.AirType)))
	if airType != AirTypeSUB {
		return Entry{}, false
	}

	episodeTime := item.EpisodeDate.In(location)

	return Entry{
		Title:       title,
		AnimeURL:    joinURLPath("https://animeschedule.net/anime/", item.Route),
		ImageURL:    joinURLPath("https://img.animeschedule.net/production/assets/public/img/", item.ImageVersionRoute),
		EpisodeText: formatEpisodeText(item.EpisodeNumber, item.SubtractedEpisodeNumber),
		AirType:     airType,
		AirsAt:      episodeTime,
		LocalTime:   episodeTime.Format("15:04"),
		Weekday:     episodeTime.Weekday(),
	}, true
}

func formatEpisodeText(episodeNumber int, subtracted int) string {
	switch {
	case subtracted > 0 && subtracted < episodeNumber:
		return fmt.Sprintf("Ep %d-%d", subtracted, episodeNumber)
	case episodeNumber > 0:
		return fmt.Sprintf("Ep %d", episodeNumber)
	default:
		return "Ep ?"
	}
}

func joinURLPath(base string, path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return ""
	}

	return base + strings.TrimLeft(trimmed, "/")
}
