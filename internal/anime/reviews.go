package anime

import (
	"errors"
	"mal/integrations/jikan"
	"mal/internal/domain"
	"strings"
	"unicode"
)

const (
	reviewPreviewRuneLimit      = 1100
	reviewPreviewBoundaryWindow = 160
)

var errReviewNotFound = errors.New("review not found")

func mapReviewEntry(it jikan.ReviewEntry, sourcePage int) domain.ReviewEntry {
	if sourcePage < 1 {
		sourcePage = 1
	}

	preview, truncated := reviewPreview(it.Review, reviewPreviewRuneLimit)
	mapped := domain.ReviewEntry{
		MalID:         it.MalID,
		URL:           it.URL,
		Type:          it.Type,
		Date:          it.Date,
		Review:        it.Review,
		Preview:       preview,
		IsTruncated:   truncated,
		Score:         it.Score,
		Tags:          append([]string(nil), it.Tags...),
		IsSpoiler:     it.IsSpoiler,
		IsPreliminary: it.IsPreliminary,
		EpisodesSeen:  it.EpisodesSeen,
		SourcePage:    sourcePage,
		Reactions: domain.ReviewReactions{
			Overall:     it.Reactions.Overall,
			Nice:        it.Reactions.Nice,
			LoveIt:      it.Reactions.LoveIt,
			Funny:       it.Reactions.Funny,
			Confusing:   it.Reactions.Confusing,
			Informative: it.Reactions.Informative,
			WellWritten: it.Reactions.WellWritten,
			Creative:    it.Reactions.Creative,
		},
	}
	mapped.User.URL = it.User.URL
	mapped.User.Username = it.User.Username
	mapped.User.Images.Jpg.ImageURL = it.User.Images.Jpg.ImageURL
	mapped.User.Images.Webp.ImageURL = it.User.Images.Webp.ImageURL
	return mapped
}

func reviewPreview(review string, limit int) (string, bool) {
	normalized := normalizeReviewWhitespace(review)
	if limit <= 0 {
		return "", normalized != ""
	}

	runes := []rune(normalized)
	if len(runes) <= limit {
		return normalized, false
	}

	cutoff := reviewPreviewCutoff(runes, limit)
	preview := strings.TrimRightFunc(string(runes[:cutoff]), unicode.IsSpace)
	if preview == "" {
		return "...", true
	}
	return preview + "...", true
}

func normalizeReviewWhitespace(review string) string {
	replacer := strings.NewReplacer("\r\n", "\n", "\r", "\n")
	return replacer.Replace(review)
}

func reviewPreviewCutoff(runes []rune, limit int) int {
	cutoff := min(limit, len(runes))
	window := min(reviewPreviewBoundaryWindow, max(1, limit/3))
	windowStart := max(0, cutoff-window)
	for i := cutoff; i > windowStart; i-- {
		if unicode.IsSpace(runes[i-1]) {
			return i - 1
		}
	}
	return cutoff
}
