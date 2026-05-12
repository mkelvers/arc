package playback

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mal/pkg/net/utls"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	allAnimeBaseURL  = "https://api.allanime.day"
	allAnimeReferer  = "https://allmanga.to/"
	allAnimeOrigin   = "https://youtu-chan.com"
	defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0"
)

var (
	aesKeys = []string{"Xot36i3lK3:v1", "SimtVuagFbGR2K7P"}
)

var allAnimeUTLSClient = &http.Client{
	Transport: &utls.UtlsRoundTripper{},
	Timeout:   30 * time.Second,
}

type searchResult struct {
	ID    string
	MalID string
	Name  string
}

type AvailableEpisodes struct {
	Sub []string
	Dub []string
	Raw []string
}

type allAnimeClient struct {
	httpClient *http.Client
	extractor  *providerExtractor
}

func newAllAnimeClient() *allAnimeClient {
	return &allAnimeClient{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		extractor: newProviderExtractor(),
	}
}

func (c *allAnimeClient) graphqlRequest(ctx context.Context, query string, variables map[string]any) (map[string]any, error) {
	if mode, ok := variables["translationType"].(string); ok {
		variables["translationType"] = strings.ToLower(mode)
	}

	payload := map[string]any{
		"query":     query,
		"variables": variables,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal graphql payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, allAnimeBaseURL+"/api", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create graphql request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Referer", allAnimeReferer)
	req.Header.Set("User-Agent", defaultUserAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute graphql request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil, fmt.Errorf("read graphql response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("graphql status %d", resp.StatusCode)
	}

	var parsed map[string]any
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("decode graphql response: %w", err)
	}

	if errs, ok := parsed["errors"].([]any); ok && len(errs) > 0 {
		return nil, fmt.Errorf("graphql error: %v", errs[0])
	}

	return parsed, nil
}

const episodeQueryHash = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec"

func (c *allAnimeClient) graphqlRequestWithHash(ctx context.Context, showID, episode, mode string) (map[string]any, error) {
	mode = strings.ToLower(mode)

	varsJSON := fmt.Sprintf(`{"showId":"%s","translationType":"%s","episodeString":"%s"}`, showID, mode, episode)
	extJSON := fmt.Sprintf(`{"persistedQuery":{"version":1,"sha256Hash":"%s"}}`, episodeQueryHash)

	apiURL := fmt.Sprintf("%s/api?variables=%s&extensions=%s",
		allAnimeBaseURL,
		url.QueryEscape(varsJSON),
		url.QueryEscape(extJSON))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
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

	resp, err := allAnimeUTLSClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute GET request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1022))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET status %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed map[string]any
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if errs, ok := parsed["errors"].([]any); ok && len(errs) > 0 {
		return nil, fmt.Errorf("graphql error: %v", errs[0])
	}

	data, ok := parsed["data"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("no data in response")
	}

	var toBeParsed string
	if s, ok := data["tobeparsed"].(string); ok && s != "" {
		toBeParsed = s
	} else if episodeData, ok := data["episode"].(map[string]any); ok {
		if s, ok := episodeData["tobeparsed"].(string); ok {
			toBeParsed = s
		}
	}

	if toBeParsed != "" {
		decrypted, err := decryptTobeparsed(toBeParsed)
		if err != nil {
			return nil, fmt.Errorf("decrypt tobeparsed: %w", err)
		}

		var ep map[string]any
		if jerr := json.Unmarshal(decrypted, &ep); jerr != nil {
			return nil, fmt.Errorf("unmarshal decrypted: %w", jerr)
		}

		var sourceURLs []any
		if srcs, ok := ep["sourceUrls"].([]any); ok {
			sourceURLs = srcs
		} else if epInner, ok := ep["episode"].(map[string]any); ok {
			if srcs, ok := epInner["sourceUrls"].([]any); ok {
				sourceURLs = srcs
			}
		}

		if len(sourceURLs) > 0 {
			return map[string]any{
				"episode": map[string]any{
					"sourceUrls": sourceURLs,
				},
			}, nil
		}
	}

	if episodeData, ok := data["episode"].(map[string]any); ok {
		if srcs, ok := episodeData["sourceUrls"].([]any); ok && len(srcs) > 0 {
			return parsed, nil
		}
	}

	return nil, fmt.Errorf("no usable data in response")
}

// GetEpisodeSources fetches stream URLs for a given show, episode, and mode (dub/sub).
func (c *allAnimeClient) GetEpisodeSources(ctx context.Context, showID string, episode string, mode string) ([]StreamSource, error) {
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
		return nil, fmt.Errorf("invalid source response")
	}

	rawSourceURLs, ok := data["episode"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid episode response")
	}

	sourceURLs, ok := rawSourceURLs["sourceUrls"].([]any)
	if !ok || len(sourceURLs) == 0 {
		return nil, fmt.Errorf("no source urls")
	}

	references := buildSourceReferences(sourceURLs)
	if len(references) == 0 {
		return nil, fmt.Errorf("no source references")
	}

	out := make([]StreamSource, 0, len(references))
	for _, ref := range references {
		target := strings.TrimSpace(ref.URL)
		if target == "" {
			continue
		}

		if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
			sourceType := detectStreamType(target)
			if sourceType == "unknown" {
				sourceType = detectEmbedType(target)
			}

			out = append(out, buildStreamSource(target, sourceType, ref.Name))
			continue
		}

		decoded := decodeSourceURL(target)
		if decoded == "" {
			continue
		}

		if strings.HasPrefix(decoded, "http://") || strings.HasPrefix(decoded, "https://") {
			sourceType := detectStreamType(decoded)
			if sourceType == "unknown" {
				sourceType = detectEmbedType(decoded)
			}

			out = append(out, buildStreamSource(decoded, sourceType, ref.Name))
			continue
		}

		if !strings.HasPrefix(decoded, "/") {
			decoded = "/" + decoded
		}

		extracted, err := c.extractor.ExtractVideoLinks(ctx, decoded)
		if err != nil {
			continue
		}

		out = append(out, extracted...)
	}

	if len(out) == 0 {
		return nil, fmt.Errorf("no playable sources extracted")
	}

	return out, nil
}

func (c *allAnimeClient) extractSourceURLsFromData(ctx context.Context, data map[string]any) []StreamSource {
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

	out := make([]StreamSource, 0, len(references))
	for _, ref := range references {
		target := strings.TrimSpace(ref.URL)
		if target == "" {
			continue
		}

		if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
			sourceType := detectStreamType(target)
			if sourceType == "unknown" {
				sourceType = detectEmbedType(target)
			}

			out = append(out, buildStreamSource(target, sourceType, ref.Name))
			continue
		}

		decoded := decodeSourceURL(target)
		if decoded == "" {
			continue
		}

		if strings.HasPrefix(decoded, "http://") || strings.HasPrefix(decoded, "https://") {
			sourceType := detectStreamType(decoded)
			if sourceType == "unknown" {
				sourceType = detectEmbedType(decoded)
			}

			out = append(out, buildStreamSource(decoded, sourceType, ref.Name))
			continue
		}

		if !strings.HasPrefix(decoded, "/") {
			decoded = "/" + decoded
		}

		extracted, err := c.extractor.ExtractVideoLinks(ctx, decoded)
		if err != nil {
			continue
		}

		out = append(out, extracted...)
	}

	return out
}

func buildStreamSource(url, sourceType, provider string) StreamSource {
	return StreamSource{
		URL:      url,
		Provider: provider,
		Type:     sourceType,
		Referer:  allAnimeReferer,
	}
}

type sourceReference struct {
	URL  string
	Name string
}

// buildSourceReferences orders source URLs by provider priority, deduplicating entries.
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

		sourceURL, _ := item["sourceUrl"].(string)
		sourceName, _ := item["sourceName"].(string)
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
		// separate prioritized providers from fallback
		if _, prioritizedProvider := prioritySet[normalized]; prioritizedProvider {
			if _, exists := prioritized[normalized]; !exists {
				prioritized[normalized] = ref
			}
			continue
		}

		fallback = append(fallback, ref)
	}

	// output: prioritized in order, then fallback
	ordered := make([]sourceReference, 0, len(prioritized)+len(fallback))
	for _, provider := range priorityOrder {
		if ref, ok := prioritized[provider]; ok {
			ordered = append(ordered, ref)
		}
	}

	ordered = append(ordered, fallback...)
	return ordered
}

func decryptTobeparsed(encoded string) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("base64 decode failed: %w", err)
	}

	if len(raw) < 29 {
		return nil, fmt.Errorf("encrypted payload too short")
	}

	version := raw[0]
	iv := raw[1:13]
	cipherText := raw[13 : len(raw)-16]

	for _, keyStr := range aesKeys {
		key := sha256.Sum256([]byte(keyStr))

		block, err := aes.NewCipher(key[:])
		if err != nil {
			continue
		}

		if version == 1 {
			plainText := tryDecryptCTR(block, iv, cipherText)
			if json.Valid(plainText) {
				return plainText, nil
			}
		}

		gcm, err := cipher.NewGCM(block)
		if err == nil {
			tag := raw[len(raw)-16:]
			combined := append(append([]byte{}, cipherText...), tag...)
			plainText, openErr := gcm.Open(nil, iv, combined, nil)
			if openErr == nil && json.Valid(plainText) {
				return plainText, nil
			}
		}
	}

	return nil, fmt.Errorf("decryption failed")
}

func tryDecryptCTR(block cipher.Block, iv []byte, cipherText []byte) []byte {
	ctrIV := append([]byte{}, iv...)
	ctrIV = append(ctrIV, 0x00, 0x00, 0x00, 0x02)
	ctr := cipher.NewCTR(block, ctrIV)
	plainText := make([]byte, len(cipherText))
	ctr.XORKeyStream(plainText, cipherText)
	return plainText
}

// Search queries AllAnime for shows matching the given search term.
func (c *allAnimeClient) Search(ctx context.Context, query string, mode string) ([]searchResult, error) {
	graphqlQuery := `query($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
		shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
			edges {
				_id
				malId
				name
			}
		}
	}`

	variables := map[string]any{
		"search": map[string]any{
			"allowAdult":   false,
			"allowUnknown": false,
			"query":        query,
		},
		"limit":           40,
		"page":            1,
		"translationType": mode,
		"countryOrigin":   "ALL",
	}

	result, err := c.graphqlRequest(ctx, graphqlQuery, variables)
	if err != nil {
		return nil, err
	}

	data, ok := result["data"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid search response")
	}

	shows, ok := data["shows"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid shows payload")
	}

	edges, ok := shows["edges"].([]any)
	if !ok {
		return nil, fmt.Errorf("invalid search edges")
	}

	out := make([]searchResult, 0, len(edges))
	for _, edge := range edges {
		item, ok := edge.(map[string]any)
		if !ok {
			continue
		}

		id, _ := item["_id"].(string)
		malID, _ := item["malId"].(string)
		name, _ := item["name"].(string)
		if unquoted, err := strconv.Unquote("\"" + name + "\""); err == nil {
			name = unquoted
		}
		name = strings.TrimSpace(name)

		if id == "" {
			continue
		}

		out = append(out, searchResult{ID: id, MalID: malID, Name: name})
	}

	return out, nil
}

// GetEpisodes returns the list of available episode strings for a show and mode.
func (c *allAnimeClient) GetEpisodes(ctx context.Context, showID string, mode string) ([]string, error) {
	graphqlQuery := `query($showId: String!) {
		show(_id: $showId) {
			availableEpisodesDetail
		}
	}`

	result, err := c.graphqlRequest(ctx, graphqlQuery, map[string]any{"showId": showID})
	if err != nil {
		return nil, err
	}

	data, ok := result["data"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid episode response")
	}

	show, ok := data["show"].(map[string]any)
	if !ok || show == nil {
		return nil, fmt.Errorf("show not found")
	}

	detail, ok := show["availableEpisodesDetail"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid episodes detail")
	}

	rawList, ok := detail[mode].([]any)
	if !ok {
		return nil, fmt.Errorf("no episodes for mode %s", mode)
	}

	episodes := make([]string, 0, len(rawList))
	for _, item := range rawList {
		episode, ok := item.(string)
		if !ok {
			continue
		}

		episode = strings.TrimSpace(episode)
		if episode == "" {
			continue
		}

		episodes = append(episodes, episode)
	}

	return episodes, nil
}

// GetAvailableEpisodes returns the count of sub/dub/raw episodes available for a show.
func (c *allAnimeClient) GetAvailableEpisodes(ctx context.Context, showID string) (AvailableEpisodes, error) {
	graphqlQuery := `query($showId: String!) {
		show(_id: $showId) {
			availableEpisodesDetail
			lastEpisodeInfo
		}
	}`

	result, err := c.graphqlRequest(ctx, graphqlQuery, map[string]any{"showId": showID})
	if err != nil {
		return AvailableEpisodes{}, err
	}

	data, ok := result["data"].(map[string]any)
	if !ok {
		return AvailableEpisodes{}, fmt.Errorf("invalid response")
	}

	show, ok := data["show"].(map[string]any)
	if !ok || show == nil {
		return AvailableEpisodes{}, fmt.Errorf("show not found")
	}

	detail, ok := show["availableEpisodesDetail"].(map[string]any)
	if !ok {
		return AvailableEpisodes{}, fmt.Errorf("invalid detail")
	}

	var count AvailableEpisodes
	if sub, ok := detail["sub"].([]any); ok {
		for _, s := range sub {
			if str, ok := s.(string); ok {
				count.Sub = append(count.Sub, str)
			}
		}
	}
	if dub, ok := detail["dub"].([]any); ok {
		for _, s := range dub {
			if str, ok := s.(string); ok {
				count.Dub = append(count.Dub, str)
			}
		}
	}
	if raw, ok := detail["raw"].([]any); ok {
		for _, s := range raw {
			if str, ok := s.(string); ok {
				count.Raw = append(count.Raw, str)
			}
		}
	}

	return count, nil
}

func (c *allAnimeClient) GetEpisodeMetadata(ctx context.Context, showID string, episode string) (map[string]any, error) {
	graphqlQuery := `query($showId: String!, $episodeString: String!, $translationType: VaildTranslationTypeEnumType!) {
		episode(showId: $showId, episodeString: $episodeString, translationType: $translationType) {
			notes
			episodeInfo {
				notes
				thumbnails
				vidinfors {
					vidPath
				}
			}
		}
	}`

	result, err := c.graphqlRequest(ctx, graphqlQuery, map[string]any{
		"showId":          showID,
		"episodeString":   episode,
		"translationType": "sub",
	})
	if err != nil {
		return nil, err
	}

	data, ok := result["data"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid response")
	}

	ep, ok := data["episode"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("episode not found")
	}

	return ep, nil
}

func decodeSourceURL(encoded string) string {
	if encoded == "" {
		return ""
	}

	encoded = strings.TrimPrefix(encoded, "--")

	substitutions := map[string]string{
		"79": "A", "7a": "B", "7b": "C", "7c": "D", "7d": "E",
		"7e": "F", "7f": "G", "70": "H", "71": "I", "72": "J",
		"73": "K", "74": "L", "75": "M", "76": "N", "77": "O",
		"68": "P", "69": "Q", "6a": "R", "6b": "S", "6c": "T",
		"6d": "U", "6e": "V", "6f": "W", "60": "X", "61": "Y",
		"62": "Z",
		"59": "a", "5a": "b", "5b": "c", "5c": "d", "5d": "e",
		"5e": "f", "5f": "g", "50": "h", "51": "i", "52": "j",
		"53": "k", "54": "l", "55": "m", "56": "n", "57": "o",
		"48": "p", "49": "q", "4a": "r", "4b": "s", "4c": "t",
		"4d": "u", "4e": "v", "4f": "w", "40": "x", "41": "y",
		"42": "z",
		"08": "0", "09": "1", "0a": "2", "0b": "3", "0c": "4",
		"0d": "5", "0e": "6", "0f": "7", "00": "8", "01": "9",
		"15": "-", "16": ".", "67": "_", "46": "~", "02": ":",
		"17": "/", "07": "?", "1b": "#", "63": "[", "65": "]",
		"78": "@", "19": "!", "1c": "$", "1e": "&", "10": "(",
		"11": ")", "12": "*", "13": "+", "14": ",", "03": ";",
		"05": "=", "1d": "%",
	}

	var result strings.Builder
	for idx := 0; idx < len(encoded); {
		if idx+2 <= len(encoded) {
			pair := encoded[idx : idx+2]
			if sub, ok := substitutions[pair]; ok {
				result.WriteString(sub)
				idx += 2
				continue
			}
		}

		result.WriteByte(encoded[idx])
		idx++
	}

	decoded := result.String()
	if strings.Contains(decoded, "/clock") && !strings.Contains(decoded, "/clock.json") {
		decoded = strings.Replace(decoded, "/clock", "/clock.json", 1)
	}

	return decoded
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
