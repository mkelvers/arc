package animeschedule

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mal/pkg/net/limits"
	"mal/pkg/net/useragent"
	"net/http"
	"net/url"
	"os"
	"regexp"
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

func scheduleLocation() *time.Location {
	// Use the host's local timezone (e.g. CEST) so the schedule matches the user's environment.
	return time.Local
}

func FetchWeek(ctx context.Context, httpClient *http.Client, year int, week int) (WeekSchedule, error) {
	apiToken := strings.TrimSpace(os.Getenv("ANIMESCHEDULE_API_TOKEN"))

	if apiToken != "" {
		return fetchWeekAPI(ctx, httpClient, apiToken, year, week)
	}

	u, _ := url.Parse("https://animeschedule.net/")
	q := u.Query()
	if year > 0 {
		q.Set("year", strconv.Itoa(year))
	}
	if week > 0 {
		q.Set("week", strconv.Itoa(week))
	}
	u.RawQuery = q.Encode()

	doc, finalURL, err := fetchDocument(ctx, httpClient, u.String())
	if err != nil {
		return WeekSchedule{}, err
	}

	resolvedYear := year
	resolvedWeek := week
	if resolvedWeek == 0 {
		if match := reWeek.FindStringSubmatch(finalURL); len(match) == 2 {
			if v, err := strconv.Atoi(match[1]); err == nil {
				resolvedWeek = v
			}
		}
	}
	if resolvedYear == 0 {
		if match := reYear.FindStringSubmatch(finalURL); len(match) == 2 {
			if v, err := strconv.Atoi(match[1]); err == nil {
				resolvedYear = v
			}
		}
	}

	out := WeekSchedule{
		Year: resolvedYear,
		Week: resolvedWeek,
		Days: map[time.Weekday][]Entry{},
	}

	doc.Find(".timetable-column").Each(func(_ int, column *goquery.Selection) {
		h1 := column.Find("h1.timetable-column-date").First()
		rawHeader := strings.Join(strings.Fields(strings.TrimSpace(h1.Text())), " ")
		weekday := parseWeekdayFromHeader(rawHeader)
		if weekday == nil {
			return
		}

		dayEntries := make([]Entry, 0, 16)

		column.Find(".timetable-column-show").Each(func(_ int, show *goquery.Selection) {
			if selectionHasClass(show, "filtered-out") {
				return
			}

			a := show.Find("a.show-link").First()
			title := strings.TrimSpace(a.Find("h2").First().Text())
			if title == "" {
				title = strings.TrimSpace(a.Text())
			}
			href, _ := a.Attr("href")
			animeURL := absolutizeURL("https://animeschedule.net", href)

			imageURL := ""
			if img := a.Find("img").First(); img != nil && img.Length() == 1 {
				if src, ok := img.Attr("data-src"); ok {
					imageURL = strings.TrimSpace(src)
				}
				if imageURL == "" {
					if src, ok := img.Attr("src"); ok && !strings.HasPrefix(src, "data:") {
						imageURL = strings.TrimSpace(src)
					}
				}
			}

			meta := show.Find("h3.time-bar").First()
			metaText := strings.Join(strings.Fields(strings.TrimSpace(meta.Text())), " ")

			epText, _, airType := parseMeta(metaText)
			localTime, _, _ := parseLocalTime(meta)
			if title == "" || animeURL == "" || localTime == "" || airType == "" {
				return
			}

			dayEntries = append(dayEntries, Entry{
				Title:       title,
				AnimeURL:    animeURL,
				ImageURL:    imageURL,
				EpisodeText: epText,
				AirType:     airType,
				LocalTime:   localTime,
				DateLabel:   rawHeader,
				Weekday:     *weekday,
			})
		})

		if len(dayEntries) == 0 {
			return
		}

		out.Days[*weekday] = append(out.Days[*weekday], dayEntries...)
	})

	return out, nil
}

func selectionHasClass(selection *goquery.Selection, className string) bool {
	raw, ok := selection.Attr("class")
	if !ok {
		return false
	}
	for _, class := range strings.Fields(raw) {
		if class == className {
			return true
		}
	}
	return false
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
	var timeIdx int = -1
	for i := 0; i < len(parts); i++ {
		if strings.Contains(parts[i], ":") && len(parts[i]) >= 4 {
			timeIdx = i
			break
		}
	}
	if timeIdx == -1 || timeIdx+2 >= len(parts) {
		return "", "", ""
	}

	localTime = strings.TrimSpace(parts[timeIdx] + " " + parts[timeIdx+1])
	typeRaw := strings.TrimSpace(parts[timeIdx+2])
	switch strings.ToUpper(typeRaw) {
	case "JPN":
		airType = AirTypeJPN
	case "SUB":
		airType = AirTypeSUB
	case "DUB":
		airType = AirTypeDUB
	default:
		return "", "", ""
	}

	episodeText = strings.TrimSpace(strings.Join(parts[:timeIdx], " "))
	return episodeText, localTime, airType
}

func parseLocalTime(meta *goquery.Selection) (localTime string, rawDatetime string, rawRenderedTime string) {
	// AnimeSchedule updates rendered time client-side based on the viewer's timezone.
	// The server-rendered HTML can show a different time string, so we prefer the `datetime`
	// attribute when available.
	t := meta.Find("time").First()
	if t.Length() == 1 {
		rawRenderedTime = strings.Join(strings.Fields(strings.TrimSpace(t.Text())), " ")
		if raw, ok := t.Attr("datetime"); ok {
			rawDatetime = raw
			if parsed, err := time.Parse(time.RFC3339, rawDatetime); err == nil {
				localTime = parsed.In(scheduleLocation()).Format("03:04 PM")
				return localTime, rawDatetime, rawRenderedTime
			}
		}
	}

	fallback := strings.Join(strings.Fields(strings.TrimSpace(meta.Text())), " ")
	_, parsedTime, _ := parseMeta(fallback)
	return parsedTime, "", ""
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
	request.Header.Set("User-Agent", useragent.Chrome135)
	request.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	request.Header.Set("Accept-Language", "en-US,en;q=0.9")
	request.Header.Set("Referer", "https://animeschedule.net/")
	request.Header.Set("Cache-Control", "no-cache")
}

func fetchDocument(ctx context.Context, httpClient *http.Client, url string) (*goquery.Document, string, error) {
	client := httpClient
	if client == nil {
		client = http.DefaultClient
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, url, fmt.Errorf("failed to create request: %w", err)
	}
	addCommonHeaders(request)

	response, err := client.Do(request)
	if err != nil {
		return nil, url, fmt.Errorf("request failed: %w", err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, limits.Bytes512))
		return nil, url, &HTTPStatusError{
			StatusCode:  response.StatusCode,
			URL:         url,
			ContentType: strings.TrimSpace(response.Header.Get("Content-Type")),
			BodyPreview: strings.Join(strings.Fields(strings.TrimSpace(string(body))), " "),
		}
	}

	document, err := goquery.NewDocumentFromReader(response.Body)
	if err != nil {
		return nil, url, fmt.Errorf("failed to parse html: %w", err)
	}

	return document, response.Request.URL.String(), nil
}

type timetableAnimeAPI struct {
	Title                  string    `json:"title"`
	Route                  string    `json:"route"`
	EpisodeDate            time.Time `json:"episodeDate"`
	EpisodeNumber          int       `json:"episodeNumber"`
	SubtractedEpisodeNumber int      `json:"subtractedEpisodeNumber"`
	AirType                string    `json:"airType"`
	ImageVersionRoute      string    `json:"imageVersionRoute"`
}

func fetchWeekAPI(ctx context.Context, httpClient *http.Client, token string, year int, week int) (WeekSchedule, error) {
	client := httpClient
	if client == nil {
		client = http.DefaultClient
	}

	u, _ := url.Parse("https://animeschedule.net/api/v3/timetables/sub")
	q := u.Query()
	if year > 0 && week > 0 {
		q.Set("year", strconv.Itoa(year))
		q.Set("week", strconv.Itoa(week))
	}
	tz := strings.TrimSpace(os.Getenv("ANIMESCHEDULE_TZ"))
	if tz == "" {
		tz = "Europe/Copenhagen"
	}
	q.Set("tz", tz)
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return WeekSchedule{}, fmt.Errorf("create api request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", useragent.Chrome135)

	res, err := client.Do(req)
	if err != nil {
		return WeekSchedule{}, fmt.Errorf("api request failed: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, limits.Bytes512))
		return WeekSchedule{}, &HTTPStatusError{
			StatusCode:  res.StatusCode,
			URL:         u.String(),
			ContentType: strings.TrimSpace(res.Header.Get("Content-Type")),
			BodyPreview: strings.Join(strings.Fields(strings.TrimSpace(string(body))), " "),
		}
	}

	var payload []timetableAnimeAPI
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return WeekSchedule{}, fmt.Errorf("decode timetables api: %w", err)
	}

	resolvedYear := year
	resolvedWeek := week
	if resolvedYear == 0 || resolvedWeek == 0 {
		resolvedYear, resolvedWeek = time.Now().In(time.Local).ISOWeek()
	}

	out := WeekSchedule{
		Year: resolvedYear,
		Week: resolvedWeek,
		Days: map[time.Weekday][]Entry{},
	}

	for _, item := range payload {
		title := strings.TrimSpace(item.Title)
		if title == "" {
			continue
		}

		episodeNumber := item.EpisodeNumber
		subtracted := item.SubtractedEpisodeNumber
		episodeText := ""
		switch {
		case subtracted > 0 && subtracted < episodeNumber:
			episodeText = fmt.Sprintf("Ep %d-%d", subtracted, episodeNumber)
		case episodeNumber > 0:
			episodeText = fmt.Sprintf("Ep %d", episodeNumber)
		default:
			episodeText = "Ep ?"
		}

		airType := AirType(strings.ToUpper(strings.TrimSpace(item.AirType)))
		if airType != AirTypeJPN && airType != AirTypeSUB && airType != AirTypeDUB {
			continue
		}

		episodeTime := item.EpisodeDate.In(time.Local)
		weekday := episodeTime.Weekday()
		localTime := episodeTime.Format("03:04 PM")

		imageURL := ""
		if strings.TrimSpace(item.ImageVersionRoute) != "" {
			imageURL = "https://img.animeschedule.net/production/assets/public/img/" + strings.TrimLeft(strings.TrimSpace(item.ImageVersionRoute), "/")
		}

		animeURL := ""
		if strings.TrimSpace(item.Route) != "" {
			animeURL = "https://animeschedule.net/anime/" + strings.TrimLeft(strings.TrimSpace(item.Route), "/")
		}

		out.Days[weekday] = append(out.Days[weekday], Entry{
			Title:       title,
			AnimeURL:    animeURL,
			ImageURL:    imageURL,
			EpisodeText: episodeText,
			AirType:     airType,
			LocalTime:   localTime,
			Weekday:     weekday,
		})
	}

	return out, nil
}
