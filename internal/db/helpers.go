// Package db provides database access via sqlc-generated queries and helper functions.
package db

import "database/sql"

// NullStringOr returns n.String if valid and non-empty, otherwise fallback
func NullStringOr(n sql.NullString, fallback string) string {
	if n.Valid && n.String != "" {
		return n.String
	}
	return fallback
}

// DisplayTitle returns the English title, falling back to Japanese then original
func DisplayTitle(titleEnglish, titleJapanese sql.NullString, titleOriginal string) string {
	return NullStringOr(titleEnglish, NullStringOr(titleJapanese, titleOriginal))
}

func (r GetUserWatchListRow) DisplayTitle() string {
	return DisplayTitle(r.TitleEnglish, r.TitleJapanese, r.TitleOriginal)
}

func (r GetContinueWatchingEntriesRow) DisplayTitle() string {
	return DisplayTitle(r.TitleEnglish, r.TitleJapanese, r.TitleOriginal)
}
