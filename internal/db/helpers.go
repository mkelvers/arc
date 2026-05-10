package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

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

// BoolPtr converts a nullable bool to a pointer; nil if not valid
func BoolPtr(b sql.NullBool) *bool {
	if !b.Valid {
		return nil
	}
	return &b.Bool
}

// BeginTx starts a transaction and returns the Queries wrapper bound to it
func BeginTx(ctx context.Context, db *sql.DB) (*Queries, *sql.Tx, error) {
	if db == nil {
		return nil, nil, errors.New("database unavailable")
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	return New(tx), tx, nil
}
