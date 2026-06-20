package allanime

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	errlog "mal/pkg"
	netutil "mal/pkg/net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type providerExtractor struct {
	httpClient *http.Client
	baseURL    string
	referer    string
}

type providerLinkItem struct {
	link          string
	resolutionStr string
}

type providerHLSItem struct {
	url         string
	hardsubLang string
}

type providerResponseData struct {
	referer   string
	links     []providerLinkItem
	hls       []providerHLSItem
	subtitles []Subtitle
}

func newProviderExtractor() *providerExtractor {
	return &providerExtractor{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    allAnimeSiteURL,
		referer:    allAnimeReferer,
	}
}

// ExtractVideoLinks fetches provider page and returns stream sources.
func (e *providerExtractor) ExtractVideoLinks(ctx context.Context, providerPath string) ([]StreamSource, error) {
	endpoint := e.baseURL + providerPath

	var resp *http.Response
	var err error

	for attempt := range 3 {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * 2 * time.Second):
			}
		}

		resp, err = doProxiedRequest(ctx, e.httpClient, endpoint, e.referer)
		if err == nil {
			break
		}

		if attempt == 2 {
			return nil, fmt.Errorf("fetch provider response: %w", err)
		}
	}

	defer func() {
		errlog.Log("failed to close provider response body", resp.Body.Close())
	}()

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.MiB2)) // 2MB limit
	if err != nil {
		return nil, fmt.Errorf("read provider response: %w", err)
	}

	return e.parseProviderResponse(ctx, string(body)), nil
}

func (e *providerExtractor) ExtractEmbedVideoLinks(ctx context.Context, rawURL string) ([]StreamSource, error) {
	resp, err := doProxiedRequest(ctx, e.httpClient, rawURL, e.referer)
	if err != nil {
		return nil, fmt.Errorf("fetch embed response: %w", err)
	}
	defer func() {
		errlog.Log("failed to close embed response body", resp.Body.Close())
	}()

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.MiB2))
	if err != nil {
		return nil, fmt.Errorf("read embed response: %w", err)
	}

	return parseExternalEmbedResponse(rawURL, string(body), e.referer), nil
}

// parseProviderResponse extracts stream sources from provider JSON response.
func (e *providerExtractor) parseProviderResponse(ctx context.Context, response string) []StreamSource {
	var root any
	if err := json.Unmarshal([]byte(response), &root); err != nil {
		return []StreamSource{}
	}

	data := collectProviderResponseData(root, e.referer)
	sources := buildProviderLinkSources(data.links, data.referer)
	sources = append(sources, e.buildProviderHLSSources(ctx, data.hls, data.referer)...)

	attachSubtitles(sources, data.subtitles)

	return sources
}

func collectProviderResponseData(root any, fallbackReferer string) providerResponseData {
	data := providerResponseData{referer: fallbackReferer}

	var walk func(v any)
	walk = func(v any) {
		switch x := v.(type) {
		case map[string]any:
			collectProviderMapData(x, &data)
			for _, child := range x {
				walk(child)
			}
		case []any:
			for _, child := range x {
				walk(child)
			}
		}
	}

	walk(root)
	if data.referer == "" {
		data.referer = fallbackReferer
	}

	return data
}

func collectProviderMapData(node map[string]any, data *providerResponseData) {
	if ref, ok := node["Referer"].(string); ok {
		if trimmedRef := strings.TrimSpace(ref); trimmedRef != "" {
			data.referer = trimmedRef
		}
	}

	if link, ok := node["link"].(string); ok {
		if res, ok := node["resolutionStr"].(string); ok {
			data.links = append(data.links, providerLinkItem{link: link, resolutionStr: res})
		}
	}

	if url, ok := node["url"].(string); ok {
		if lang, ok := node["hardsub_lang"].(string); ok {
			data.hls = append(data.hls, providerHLSItem{url: url, hardsubLang: lang})
		}
	}

	if subs, ok := node["subtitles"].([]any); ok {
		data.subtitles = append(data.subtitles, parseProviderSubtitles(subs)...)
	}
}

func parseProviderSubtitles(items []any) []Subtitle {
	subtitles := make([]Subtitle, 0, len(items))
	for _, item := range items {
		node, ok := item.(map[string]any)
		if !ok {
			continue
		}

		lang, ok := node["lang"].(string)
		if !ok {
			continue
		}
		src, ok := node["src"].(string)
		if !ok {
			continue
		}
		lang = strings.TrimSpace(lang)
		src = strings.TrimSpace(src)
		if lang == "" || src == "" {
			continue
		}

		subtitles = append(subtitles, Subtitle{Lang: lang, URL: src})
	}

	return subtitles
}

func buildProviderLinkSources(items []providerLinkItem, referer string) []StreamSource {
	sources := make([]StreamSource, 0, len(items))
	for _, item := range items {
		link := strings.TrimSpace(item.link)
		if link == "" {
			continue
		}

		sources = append(sources, StreamSource{
			URL:      link,
			Quality:  strings.TrimSpace(item.resolutionStr),
			Provider: "wixmp",
			Type:     detectProviderSourceType(link),
			Referer:  referer,
		})
	}

	return sources
}

func detectProviderSourceType(link string) string {
	sourceType := detectStreamType(link)
	if sourceType != "unknown" {
		return sourceType
	}

	return detectEmbedType(link)
}

func (e *providerExtractor) buildProviderHLSSources(ctx context.Context, items []providerHLSItem, referer string) []StreamSource {
	sources := make([]StreamSource, 0, len(items))
	for _, item := range items {
		playlistURL, ok := providerPlaylistURL(item)
		if !ok {
			continue
		}

		if strings.Contains(playlistURL, "master.m3u8") {
			parsed, err := e.parseM3U8(ctx, playlistURL, referer)
			if err == nil {
				sources = append(sources, parsed...)
			}
			continue
		}

		sources = append(sources, StreamSource{
			URL:      playlistURL,
			Quality:  "auto",
			Provider: "hls",
			Type:     "m3u8",
			Referer:  referer,
		})
	}

	return sources
}

func providerPlaylistURL(item providerHLSItem) (string, bool) {
	playlistURL := strings.TrimSpace(item.url)
	if playlistURL == "" || item.hardsubLang != "en-US" {
		return "", false
	}

	return playlistURL, true
}

func attachSubtitles(sources []StreamSource, subtitles []Subtitle) {
	if len(subtitles) == 0 || len(sources) == 0 {
		return
	}

	for idx := range sources {
		sources[idx].Subtitles = append([]Subtitle(nil), subtitles...)
	}
}

// parseM3U8 fetches a master playlist and extracts individual stream URLs with bandwidth-derived quality.
func (e *providerExtractor) parseM3U8(ctx context.Context, masterURL string, referer string) ([]StreamSource, error) {
	resp, err := doProxiedRequest(ctx, e.httpClient, masterURL, referer)
	if err != nil {
		return nil, err
	}
	defer func() {
		errlog.Log("failed to close m3u8 response body", resp.Body.Close())
	}()

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.KiB512)) // 512KB limit
	if err != nil {
		return nil, err
	}

	return parseM3U8Sources(string(body), masterURL, referer), nil
}

func parseM3U8Sources(body string, masterURL string, referer string) []StreamSource {
	lines := strings.Split(body, "\n")
	baseURL := playlistBaseURL(masterURL)
	bwPattern := regexp.MustCompile(`BANDWIDTH=(\d+)`)
	currentBandwidth := 0
	sources := make([]StreamSource, 0)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if bandwidth, ok := parseStreamBandwidth(trimmed, bwPattern); ok {
			currentBandwidth = bandwidth
			continue
		}
		if shouldSkipM3U8Line(trimmed) {
			continue
		}

		sources = append(sources, StreamSource{
			URL:      resolvePlaylistURL(trimmed, baseURL),
			Quality:  qualityFromBandwidth(currentBandwidth),
			Provider: "hls",
			Type:     "m3u8",
			Referer:  referer,
		})
	}

	return sources
}

func playlistBaseURL(masterURL string) string {
	if idx := strings.LastIndex(masterURL, "/"); idx >= 0 {
		return masterURL[:idx+1]
	}

	return masterURL
}

func parseStreamBandwidth(line string, bwPattern *regexp.Regexp) (int, bool) {
	if !strings.HasPrefix(line, "#EXT-X-STREAM-INF") {
		return 0, false
	}

	match := bwPattern.FindStringSubmatch(line)
	if len(match) < 2 {
		return 0, true
	}

	value, err := strconv.Atoi(match[1])
	if err != nil {
		return 0, true
	}

	return value, true
}

func shouldSkipM3U8Line(line string) bool {
	return line == "" || strings.HasPrefix(line, "#")
}

func resolvePlaylistURL(streamURL string, baseURL string) string {
	if strings.HasPrefix(streamURL, "http://") || strings.HasPrefix(streamURL, "https://") {
		return streamURL
	}

	return baseURL + streamURL
}

func qualityFromBandwidth(bandwidth int) string {
	kbps := bandwidth / 1000

	switch {
	case kbps >= 8000:
		return "1080p"
	case kbps >= 5000:
		return "720p"
	case kbps >= 2500:
		return "480p"
	case kbps > 0:
		return "360p"
	default:
		return "auto"
	}
}

func parseExternalEmbedResponse(rawURL string, body string, fallbackReferer string) []StreamSource {
	switch {
	case strings.Contains(strings.ToLower(rawURL), "ok.ru/"):
		return parseOKRUSources(body, fallbackReferer)
	case strings.Contains(strings.ToLower(rawURL), "mp4upload.com/"):
		return parseMP4UploadSources(body, fallbackReferer)
	default:
		return nil
	}
}

func parseOKRUSources(body string, referer string) []StreamSource {
	unescapedBody := html.UnescapeString(body)
	manifestPattern := regexp.MustCompile(`\\"hlsManifestUrl\\":\\"([^"]+)\\"|"hlsManifestUrl":"([^"]+)"`)
	match := manifestPattern.FindStringSubmatch(unescapedBody)
	if len(match) < 3 {
		return nil
	}

	playlistURL := decodeEscapedMediaURL(firstNonEmptyString(match[1], match[2]))
	if playlistURL == "" {
		return nil
	}

	return []StreamSource{{
		URL:      playlistURL,
		Quality:  "auto",
		Provider: "ok",
		Type:     "m3u8",
		Referer:  referer,
	}}
}

func parseMP4UploadSources(body string, referer string) []StreamSource {
	srcPattern := regexp.MustCompile(`(?m)src:\s*"([^"]+)"`)
	match := srcPattern.FindStringSubmatch(body)
	if len(match) < 2 {
		return nil
	}

	mediaURL := decodeEscapedMediaURL(match[1])
	if mediaURL == "" {
		return nil
	}

	return []StreamSource{{
		URL:      mediaURL,
		Provider: "mp4upload",
		Type:     detectProviderSourceType(mediaURL),
		Referer:  referer,
	}}
}

func decodeEscapedMediaURL(raw string) string {
	if unquoted, err := strconv.Unquote(`"` + raw + `"`); err == nil {
		raw = unquoted
	}

	replacer := strings.NewReplacer(
		`\\u002F`, `/`,
		`\\u0026`, "&",
		`\/`, `/`,
		`\u002F`, `/`,
		`\u0026`, "&",
		`&amp;`, "&",
	)

	return strings.TrimSpace(replacer.Replace(raw))
}
