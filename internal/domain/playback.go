package domain

import (
	"context"
	"mal/internal/db"
)

type PlaybackService interface {
	BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (map[string]any, error)
	SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error
}

type PlaybackRepository interface {
	GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error)
	GetContinueWatchingEntry(ctx context.Context, params db.GetContinueWatchingEntryParams) (db.GetContinueWatchingEntryRow, error)
	SaveWatchProgress(ctx context.Context, params db.SaveWatchProgressParams) error
	UpsertContinueWatchingEntry(ctx context.Context, params db.UpsertContinueWatchingEntryParams) (db.ContinueWatchingEntry, error)
}
