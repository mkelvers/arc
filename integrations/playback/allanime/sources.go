package allanime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

const episodeQueryHash = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec"

type sourceReference struct {
	URL  string
	Name string
}

func (c *AllAnimeProvider) GetEpisodeSources(ctx context.Context, showID string, episode string, mode string) ([]StreamSource, error) {
	result, err := c.graphqlRequestWithHash(ctx, showID, episode, mode)
	if err == nil {
		sources := c.sourcesFrom(ctx, result)
		if len(sources) > 0 {
			return sources, nil
		}
	}

	fallback, err := AllAnimeEpisodeSources(ctx, c.graphqlClient(), showID, translationType(mode), episode)
	if err != nil {
		return nil, err
	}

	if fallback.Episode == nil {
		return nil, errors.New("invalid episode response")
	}

	if len(fallback.Episode.SourceUrls) == 0 {
		return nil, errors.New("no source urls")
	}

	references := generatedSourceRefs(fallback.Episode.SourceUrls)
	if len(references) == 0 {
		return nil, errors.New("no source references")
	}

	out := c.resolveRefs(ctx, references)

	if len(out) == 0 {
		return nil, errors.New("no playable sources extracted")
	}

	return out, nil
}

func generatedSourceRefs(rawSourceURLs []AllAnimeEpisodeSourcesEpisodeSourceUrlsSourceURL) []sourceReference {
	refs := make([]sourceReference, 0, len(rawSourceURLs))
	seen := make(map[string]struct{})
	for _, source := range rawSourceURLs {
		appendSourceRef(&refs, seen, source.SourceUrl, source.SourceName)
	}
	return prioritizedSourceRefs(refs)
}

func (c *AllAnimeProvider) sourcesFrom(ctx context.Context, data map[string]any) []StreamSource {
	episodeData, ok := data["episode"].(map[string]any)
	if !ok {
		return nil
	}

	sourceURLs, ok := episodeData["sourceUrls"].([]any)
	if !ok || len(sourceURLs) == 0 {
		return nil
	}

	references := sourceRefs(sourceURLs)
	if len(references) == 0 {
		return nil
	}

	return c.resolveRefs(ctx, references)
}

func (c *AllAnimeProvider) resolveRefs(ctx context.Context, references []sourceReference) []StreamSource {
	out := make([]StreamSource, 0, len(references))
	for _, ref := range references {
		if source, ok := directSource(ref); ok {
			out = append(out, source)
			return out
		}

		extracted := c.resolveExtracted(ctx, ref)
		if len(extracted) > 0 {
			out = append(out, extracted...)
			return out
		}
	}

	return out
}

func directSource(ref sourceReference) (StreamSource, bool) {
	target := strings.TrimSpace(ref.URL)
	if target == "" {
		return StreamSource{}, false
	}

	if isHTTPURL(target) {
		if detectEmbedType(target) == "embed" {
			return StreamSource{}, false
		}
		return buildStreamSource(target, detectSourceType(target), ref.Name), true
	}

	decoded := decodeSourceURL(target)
	if !isHTTPURL(decoded) {
		return StreamSource{}, false
	}

	if detectEmbedType(decoded) == "embed" {
		return StreamSource{}, false
	}

	return buildStreamSource(decoded, detectSourceType(decoded), ref.Name), true
}

func (c *AllAnimeProvider) resolveExtracted(ctx context.Context, ref sourceReference) []StreamSource {
	rawURL := strings.TrimSpace(ref.URL)
	decoded := decodeSourceURL(rawURL)
	if decoded == "" {
		return nil
	}

	if isHTTPURL(decoded) {
		extracted, err := c.extractor.ExtractEmbedVideoLinks(ctx, decoded)
		if err != nil {
			return nil
		}
		return extracted
	}

	if !strings.HasPrefix(decoded, "/") {
		decoded = "/" + decoded
	}

	extracted, err := c.extractor.ExtractVideoLinks(ctx, decoded)
	if err != nil {
		return nil
	}

	return extracted
}

func detectSourceType(sourceURL string) string {
	sourceType := detectStreamType(sourceURL)
	if sourceType != "unknown" {
		return sourceType
	}

	return detectEmbedType(sourceURL)
}

func isHTTPURL(value string) bool {
	return strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://")
}

func buildStreamSource(url, sourceType, provider string) StreamSource {
	referer := allAnimeReferer
	if strings.Contains(strings.ToLower(provider), "yt-mp4") {
		referer = allAnimeSiteURL
	}
	return StreamSource{
		URL:      url,
		Provider: provider,
		Type:     sourceType,
		Referer:  referer,
	}
}

// source priority
func sourceRefs(rawSourceURLs []any) []sourceReference {
	refs := make([]sourceReference, 0, len(rawSourceURLs))
	seen := make(map[string]struct{})

	for _, source := range rawSourceURLs {
		item, ok := source.(map[string]any)
		if !ok {
			continue
		}

		sourceURL, ok := stringMapValue(item, "sourceUrl")
		if !ok {
			continue
		}
		sourceName, _ := stringMapValue(item, "sourceName")
		appendSourceRef(&refs, seen, sourceURL, sourceName)
	}

	return prioritizedSourceRefs(refs)
}

func appendSourceRef(refs *[]sourceReference, seen map[string]struct{}, sourceURL string, sourceName string) {
	sourceURL = strings.TrimSpace(sourceURL)
	sourceName = strings.TrimSpace(sourceName)
	if sourceURL == "" {
		return
	}

	if _, exists := seen[sourceURL]; exists {
		return
	}
	seen[sourceURL] = struct{}{}

	*refs = append(*refs, sourceReference{URL: sourceURL, Name: sourceName})
}

func prioritizedSourceRefs(refs []sourceReference) []sourceReference {
	priorityOrder := []string{"default", "yt-mp4", "s-mp4", "luf-mp4"}
	prioritySet := map[string]struct{}{"default": {}, "yt-mp4": {}, "s-mp4": {}, "luf-mp4": {}}

	prioritized := make(map[string]sourceReference)
	fallback := make([]sourceReference, 0, len(refs))
	for _, ref := range refs {
		normalized := strings.ToLower(ref.Name)
		if _, priority := prioritySet[normalized]; priority {
			if _, exists := prioritized[normalized]; !exists {
				prioritized[normalized] = ref
			}
			continue
		}

		fallback = append(fallback, ref)
	}

	ordered := make([]sourceReference, 0, len(prioritized)+len(fallback))
	for _, provider := range priorityOrder {
		if ref, ok := prioritized[provider]; ok {
			ordered = append(ordered, ref)
		}
	}

	ordered = append(ordered, fallback...)
	return ordered
}

func stringMapValue(item map[string]any, key string) (string, bool) {
	value, ok := item[key].(string)
	return value, ok
}

func (c *AllAnimeProvider) graphqlRequestWithHash(ctx context.Context, showID, episode, mode string) (map[string]any, error) {
	req, err := c.newHashRequest(ctx, showID, episode, mode)
	if err != nil {
		return nil, fmt.Errorf("create POST request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", defaultUserAgent)
	req.Header.Set("Referer", allAnimeReferer)
	req.Header.Set("Origin", allAnimeOrigin)
	req.Header.Set("x-build-id", "9")

	statusCode, respBody, err := executeAndReadResponse(c.httpClient, req, "execute POST request (aaReq)", "read response")
	if err != nil {
		return nil, err
	}

	if statusCode != http.StatusOK {
		return nil, fmt.Errorf("POST status %d: %s", statusCode, string(respBody))
	}

	parsed, err := parseGraphQLResponse(respBody, "decode response")
	if err != nil {
		return nil, err
	}

	data, ok := parsed["data"].(map[string]any)
	if !ok {
		return nil, errors.New("no data in response")
	}

	decrypted, err := responseFromTobeparsed(data)
	if err != nil {
		return nil, err
	}
	if decrypted != nil {
		return decrypted, nil
	}

	if len(nestedSlice(data, "episode", "sourceUrls")) > 0 {
		return parsed, nil
	}

	return nil, errors.New("no usable data in response")
}

func (c *AllAnimeProvider) newHashRequest(ctx context.Context, showID, episode, mode string) (*http.Request, error) {
	aaReq, err := makeAALease(episodeQueryHash)
	if err != nil {
		return nil, fmt.Errorf("create aa lease: %w", err)
	}

	payload := map[string]any{
		"variables": map[string]any{
			"showId":          showID,
			"translationType": strings.ToLower(mode),
			"episodeString":   episode,
		},
		"extensions": map[string]any{
			"persistedQuery": map[string]any{
				"version":    1,
				"sha256Hash": episodeQueryHash,
			},
			"aaReq": aaReq,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	return http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api", allAnimeBaseURL), bytes.NewReader(body))
}

func detectStreamType(sourceURL string) string {
	lower := strings.ToLower(sourceURL)
	if strings.Contains(lower, ".m3u8") || strings.Contains(lower, "master.m3u8") {
		return "m3u8"
	}

	if strings.Contains(lower, ".mp4") {
		return "mp4"
	}

	return "unknown"
}

func detectEmbedType(rawURL string) string {
	lower := strings.ToLower(rawURL)
	embedHosts := []string{"streamwish", "streamsb", "mp4upload", "ok.ru", "gogoplay", "streamlare"}
	for _, host := range embedHosts {
		if strings.Contains(lower, host) {
			return "embed"
		}
	}

	return "unknown"
}
