# Extract AllAnime Data Extraction Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract data parsing and stream detection logic from `allanime_client.go` into a new file `allanime_extractor.go` to improve maintainability and separate concerns.

**Architecture:** Move non-network utility functions and helper structs related to parsing AllAnime responses and URL decoding/detection into a dedicated extractor file within the same package.

**Tech Stack:** Go (Standard Library)

---

### Task 1: Create allanime_extractor.go

**Files:**
- Create: `api/playback/allanime_extractor.go`

- [ ] **Step 1: Create the file with moved logic**

```go
package playback

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"
)

type sourceReference struct {
	URL  string
	Name string
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
			log.Printf("source extraction failed for %s: %v", decoded, err)
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

func extractEpisodeData(data map[string]any) (map[string]any, error) {
	episodeData, ok := data["episode"].(map[string]any)
	if ok && episodeData != nil {
		return episodeData, nil
	}

	toBeParsed, ok := data["tobeparsed"].(string)
	if !ok || strings.TrimSpace(toBeParsed) == "" {
		return nil, fmt.Errorf("episode not found")
	}

	decoded, err := decryptTobeparsed(toBeParsed)
	if err != nil {
		return nil, fmt.Errorf("decode episode payload: %w", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(decoded, &parsed); err != nil {
		return nil, fmt.Errorf("parse decoded payload: %w", err)
	}

	episodeData, ok = parsed["episode"].(map[string]any)
	if !ok || episodeData == nil {
		return nil, fmt.Errorf("decoded payload missing episode")
	}

	return episodeData, nil
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

func getMapKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
```

- [ ] **Step 2: Commit**

```bash
git add api/playback/allanime_extractor.go
git commit -m "feat: add allanime_extractor.go with moved logic"
```

### Task 2: Update allanime_client.go

**Files:**
- Modify: `api/playback/allanime_client.go`

- [ ] **Step 1: Remove moved logic from allanime_client.go**
Remove: `extractSourceURLsFromData`, `buildStreamSource`, `sourceReference` struct, `buildSourceReferences`, `extractEpisodeData`, `decodeSourceURL`, `detectStreamType`, `detectEmbedType`, `getMapKeys`.

- [ ] **Step 2: Verify build**

Run: `go build ./api/playback/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add api/playback/allanime_client.go
git commit -m "refactor: remove moved logic from allanime_client.go"
```
