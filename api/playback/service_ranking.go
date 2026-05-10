package playback

import (
	"bytes"
	"errors"
	"sort"
	"strconv"
	"strings"
)

func rankSources(sources []StreamSource, quality string) ([]sourceScore, error) {
	filtered := make([]StreamSource, 0, len(sources))
	seen := make(map[string]struct{})

	for _, source := range sources {
		if source.URL == "" {
			continue
		}
		if _, exists := seen[source.URL]; exists {
			continue
		}
		seen[source.URL] = struct{}{}
		filtered = append(filtered, source)
	}

	if len(filtered) == 0 {
		return nil, errors.New("no playable sources available")
	}

	targetQuality := normalizeQuality(quality)
	scored := make([]sourceScore, 0, len(filtered))
	for _, source := range filtered {
		typeScore := lookupPriority(sourceTypePriority, source.Type, 200)
		providerScore := lookupPriority(providerPriority, source.Provider, 60)
		qualityScore := sourceQualityPriority(source.Quality, targetQuality)
		refererScore := 0
		if source.Referer != "" {
			refererScore = 20
		}

		total := typeScore + providerScore + qualityScore + refererScore
		scored = append(scored, sourceScore{
			source:        source,
			total:         total,
			typeScore:     typeScore,
			providerScore: providerScore,
			qualityScore:  qualityScore,
			refererScore:  refererScore,
		})
	}

	// stable sort to preserve insertion order for equal scores
	sort.SliceStable(scored, func(i int, j int) bool {
		return scored[i].total > scored[j].total
	})

	return scored, nil
}

func normalizeQuality(quality string) string {
	lower := strings.ToLower(strings.TrimSpace(quality))
	if lower == "" {
		return "best"
	}

	return lower
}

var sourceTypePriority = map[string]int{
	"mp4":     500,
	"m3u8":    450,
	"unknown": 300,
	"embed":   100,
}

var providerPriority = map[string]int{
	"s-mp4":   120,
	"default": 115,
	"luf-mp4": 110,
	"vid-mp4": 105,
	"yt-mp4":  100,
	"mp4":     95,
	"uv-mp4":  90,
	"hls":     80,
	"sw":      40,
	"ok":      35,
	"ss-hls":  30,
}

var sourceQualityDefaults = map[string]int{
	"auto": 240,
}

func lookupPriority(m map[string]int, key string, fallback int) int {
	if p, ok := m[strings.ToLower(key)]; ok {
		return p
	}
	return fallback
}

// sourceQualityPriority scores quality match: exact match gets boost, mismatch gets penalty.
func sourceQualityPriority(sourceQuality string, targetQuality string) int {
	qualityValue := parseQualityValue(sourceQuality)

	switch targetQuality {
	case "best":
		return qualityValue
	case "worst":
		return -qualityValue
	default:
		if qualityMatches(sourceQuality, targetQuality) {
			return 2000 + qualityValue
		}

		return -300 + qualityValue
	}
}

// qualityMatches checks if source matches target by substring or extracted digits.
func qualityMatches(sourceQuality string, targetQuality string) bool {
	sourceLower := strings.ToLower(sourceQuality)
	targetLower := strings.ToLower(targetQuality)

	if sourceLower == "" {
		return false
	}

	if strings.Contains(sourceLower, targetLower) {
		return true
	}

	return extractDigits(sourceLower) == extractDigits(targetLower)
}

// parseQualityValue extracts numeric value from quality string.
func parseQualityValue(rawQuality string) int {
	lower := strings.ToLower(rawQuality)
	if lower == "auto" {
		return 240
	}

	digits := extractDigits(lower)
	if digits == "" {
		return 0
	}

	value, err := strconv.Atoi(digits)
	if err != nil {
		return 0
	}
	return value
}

// extractDigits reads leading digits until a non-digit or break condition.
func extractDigits(value string) string {
	var digits []byte
	for _, char := range value {
		if char >= '0' && char <= '9' {
			digits = append(digits, byte(char))
		} else if len(digits) > 0 {
			break
		}
	}
	return string(digits)
}

// normalizeSourceTypeFromProbe overrides source type based on Content-Type header.
func normalizeSourceTypeFromProbe(source StreamSource, contentType string) StreamSource {
	lower := strings.ToLower(contentType)
	switch {
	case strings.Contains(lower, "video/mp4"):
		source.Type = "mp4"
	case strings.Contains(lower, "mpegurl"):
		source.Type = "m3u8"
	}
	return source
}

// isLikelyMP4 checks ftyp box header (bytes 4-8 of mp4 files).
func isLikelyMP4(payload []byte) bool {
	if len(payload) < 12 {
		return false
	}

	return bytes.Equal(payload[4:8], []byte("ftyp"))
}

// isLikelyM3U8 checks for m3u8 file header.
func isLikelyM3U8(payload []byte) bool {
	trimmed := strings.TrimSpace(string(payload))
	return strings.HasPrefix(trimmed, "#EXTM3U")
}
