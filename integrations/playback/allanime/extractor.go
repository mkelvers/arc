package allanime

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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

func newProviderExtractor() *providerExtractor {
	return &providerExtractor{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    allAnimeBaseURL,
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

	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.MiB2)) // 2MB limit
	if err != nil {
		return nil, fmt.Errorf("read provider response: %w", err)
	}

	return e.parseProviderResponse(ctx, string(body)), nil
}

// parseProviderResponse extracts stream sources from provider JSON response.
func (e *providerExtractor) parseProviderResponse(ctx context.Context, response string) []StreamSource {
	sources := make([]StreamSource, 0)
	providerReferer := e.referer
	var root any
	if err := json.Unmarshal([]byte(response), &root); err != nil {
		return sources
	}

	type linkItem struct {
		link          string
		resolutionStr string
	}
	type hlsItem struct {
		url         string
		hardsubLang string
	}

	linkItems := make([]linkItem, 0)
	hlsItems := make([]hlsItem, 0)
	subtitles := make([]Subtitle, 0)

	var walk func(v any)
	walk = func(v any) {
		switch x := v.(type) {
		case map[string]any:
			if ref, ok := x["Referer"].(string); ok && strings.TrimSpace(ref) != "" {
				providerReferer = strings.TrimSpace(ref)
			}

			if link, ok := x["link"].(string); ok {
				if res, ok := x["resolutionStr"].(string); ok {
					linkItems = append(linkItems, linkItem{link: link, resolutionStr: res})
				}
			}

			if u, ok := x["url"].(string); ok {
				if lang, ok := x["hardsub_lang"].(string); ok {
					hlsItems = append(hlsItems, hlsItem{url: u, hardsubLang: lang})
				}
			}

			if subs, ok := x["subtitles"].([]any); ok {
				for _, sub := range subs {
					obj, ok := sub.(map[string]any)
					if !ok {
						continue
					}
					lang, _ := obj["lang"].(string)
					src, _ := obj["src"].(string)
					lang = strings.TrimSpace(lang)
					src = strings.TrimSpace(src)
					if lang == "" || src == "" {
						continue
					}
					subtitles = append(subtitles, Subtitle{Lang: lang, URL: src})
				}
			}

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

	if providerReferer == "" {
		providerReferer = e.referer
	}

	for _, item := range linkItems {
		link := strings.TrimSpace(item.link)
		if link == "" {
			continue
		}
		quality := strings.TrimSpace(item.resolutionStr)
		sourceType := detectStreamType(link)
		if sourceType == "unknown" {
			sourceType = detectEmbedType(link)
		}

		sources = append(sources, StreamSource{
			URL:      link,
			Quality:  quality,
			Provider: "wixmp",
			Type:     sourceType,
			Referer:  providerReferer,
		})
	}

	for _, item := range hlsItems {
		if strings.TrimSpace(item.url) == "" {
			continue
		}
		if item.hardsubLang != "en-US" {
			continue
		}

		playlistURL := strings.TrimSpace(item.url)
		if strings.Contains(playlistURL, "master.m3u8") {
			parsed, err := e.parseM3U8(ctx, playlistURL, providerReferer)
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
			Referer:  providerReferer,
		})
	}

	if len(subtitles) > 0 && len(sources) > 0 {
		for idx := range sources {
			sources[idx].Subtitles = append([]Subtitle(nil), subtitles...)
		}
	}

	return sources
}

// parseM3U8 fetches a master playlist and extracts individual stream URLs with bandwidth-derived quality.
func (e *providerExtractor) parseM3U8(ctx context.Context, masterURL string, referer string) ([]StreamSource, error) {
	resp, err := doProxiedRequest(ctx, e.httpClient, masterURL, referer)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.KiB512)) // 512KB limit
	if err != nil {
		return nil, err
	}

	lines := strings.Split(string(body), "\n")
	baseURL := masterURL
	if idx := strings.LastIndex(masterURL, "/"); idx >= 0 {
		baseURL = masterURL[:idx+1]
	}

	currentBandwidth := 0
	sources := make([]StreamSource, 0)
	bwPattern := regexp.MustCompile(`BANDWIDTH=(\d+)`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#EXT-X-STREAM-INF") {
			match := bwPattern.FindStringSubmatch(trimmed)
			if len(match) >= 2 {
				value, convErr := strconv.Atoi(match[1])
				if convErr == nil {
					currentBandwidth = value
				}
			}
			continue
		}

		// skip empty lines and non-stream lines
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		streamURL := trimmed
		if !strings.HasPrefix(streamURL, "http://") && !strings.HasPrefix(streamURL, "https://") {
			streamURL = baseURL + streamURL
		}

		quality := "auto"
		kbps := currentBandwidth / 1000
		switch {
		case kbps >= 8000:
			quality = "1080p"
		case kbps >= 5000:
			quality = "720p"
		case kbps >= 2500:
			quality = "480p"
		case kbps > 0:
			quality = "360p"
		}

		sources = append(sources, StreamSource{
			URL:      streamURL,
			Quality:  quality,
			Provider: "hls",
			Type:     "m3u8",
			Referer:  referer,
		})
	}

	return sources, nil
}
