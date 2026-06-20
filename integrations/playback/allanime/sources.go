package allanime

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

const episodeQueryHash = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec"

type sourceReference struct {
	URL  string
	Name string
}

func (c *AllAnimeProvider) GetEpisodeSources(ctx context.Context, showID string, episode string, mode string) ([]StreamSource, error) {
	episodeQuery := `query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
		episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) {
			sourceUrls
		}
	}`

	result, err := c.graphqlRequestWithHash(ctx, showID, episode, mode)
	if err == nil {
		sources := c.extractSourceURLsFromData(ctx, result)
		if len(sources) > 0 {
			return sources, nil
		}
	}

	result, err = c.graphqlRequest(ctx, episodeQuery, map[string]any{
		"showId":          showID,
		"translationType": mode,
		"episodeString":   episode,
	})
	if err != nil {
		return nil, err
	}

	data, ok := result["data"].(map[string]any)
	if !ok {
		return nil, errors.New("invalid source response")
	}

	rawSourceURLs, ok := data["episode"].(map[string]any)
	if !ok {
		return nil, errors.New("invalid episode response")
	}

	sourceURLs, ok := rawSourceURLs["sourceUrls"].([]any)
	if !ok || len(sourceURLs) == 0 {
		return nil, errors.New("no source urls")
	}

	references := buildSourceReferences(sourceURLs)
	if len(references) == 0 {
		return nil, errors.New("no source references")
	}

	out := c.resolveSourceReferences(ctx, references)

	if len(out) == 0 {
		return nil, errors.New("no playable sources extracted")
	}

	return out, nil
}

func (c *AllAnimeProvider) extractSourceURLsFromData(ctx context.Context, data map[string]any) []StreamSource {
	episodeData, ok := data["episode"].(map[string]any)
	if !ok {
		return nil
	}

	sourceURLs, ok := episodeData["sourceUrls"].([]any)
	if !ok || len(sourceURLs) == 0 {
		return nil
	}

	references := buildSourceReferences(sourceURLs)
	if len(references) == 0 {
		return nil
	}

	return c.resolveSourceReferences(ctx, references)
}

func (c *AllAnimeProvider) resolveSourceReferences(ctx context.Context, references []sourceReference) []StreamSource {
	out := make([]StreamSource, 0, len(references))
	for _, ref := range references {
		if source, ok := resolveDirectSource(ref); ok {
			out = append(out, source)
			return out
		}

		extracted := c.resolveExtractedSources(ctx, ref)
		if len(extracted) > 0 {
			out = append(out, extracted...)
			return out
		}
	}

	return out
}

func resolveDirectSource(ref sourceReference) (StreamSource, bool) {
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

func (c *AllAnimeProvider) resolveExtractedSources(ctx context.Context, ref sourceReference) []StreamSource {
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
	return StreamSource{
		URL:      url,
		Provider: provider,
		Type:     sourceType,
		Referer:  allAnimeReferer,
	}
}

func buildSourceReferences(rawSourceURLs []any) []sourceReference {
	priorityOrder := []string{"default", "yt-mp4", "s-mp4", "luf-mp4"}
	prioritySet := map[string]struct{}{"default": {}, "yt-mp4": {}, "s-mp4": {}, "luf-mp4": {}}

	prioritized := make(map[string]sourceReference)
	fallback := make([]sourceReference, 0, len(rawSourceURLs))
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
		sourceURL = strings.TrimSpace(sourceURL)
		sourceName = strings.TrimSpace(sourceName)
		if sourceURL == "" {
			continue
		}

		if _, exists := seen[sourceURL]; exists {
			continue
		}
		seen[sourceURL] = struct{}{}

		ref := sourceReference{URL: sourceURL, Name: sourceName}
		normalized := strings.ToLower(sourceName)
		if _, prioritizedProvider := prioritySet[normalized]; prioritizedProvider {
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
	req, err := newEpisodeHashRequest(ctx, showID, episode, mode)
	if err != nil {
		return nil, fmt.Errorf("create GET request: %w", err)
	}

	req.Header.Set("User-Agent", defaultUserAgent)
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")
	req.Header.Set("Accept-Encoding", "identity")
	req.Header.Set("Referer", allAnimeReferer)
	req.Header.Set("Origin", allAnimeOrigin)
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Site", "cross-site")

	statusCode, respBody, err := executeAndReadResponse(c.utlsClient, req, "execute GET request", "read response")
	if err != nil {
		return nil, err
	}

	if statusCode != http.StatusOK {
		return nil, fmt.Errorf("GET status %d: %s", statusCode, string(respBody))
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

	if hasEpisodeSourceURLs(data) {
		return parsed, nil
	}

	return nil, errors.New("no usable data in response")
}

func newEpisodeHashRequest(ctx context.Context, showID, episode, mode string) (*http.Request, error) {
	varsJSON := fmt.Sprintf(`{"showId":"%s","translationType":"%s","episodeString":"%s"}`, showID, strings.ToLower(mode), episode)
	extJSON := fmt.Sprintf(`{"persistedQuery":{"version":1,"sha256Hash":"%s"}}`, episodeQueryHash)

	params := url.Values{}
	params.Set("variables", varsJSON)
	params.Set("extensions", extJSON)

	return http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api?%s", allAnimeBaseURL, params.Encode()), nil)
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
