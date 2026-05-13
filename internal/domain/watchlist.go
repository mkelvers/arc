package domain

import (
	"context"
	"mal/internal/db"
)

type WatchlistEntry = db.WatchListEntry
type UserWatchListRow = db.GetUserWatchListRow

type WatchlistService interface {
	UpdateEntry(ctx context.Context, userID string, animeID int64, status string) error
	RemoveEntry(ctx context.Context, userID string, animeID int64) error
	GetWatchlist(ctx context.Context, userID string) ([]UserWatchListRow, error)
	GetContinueWatchingEntry(ctx context.Context, userID string, animeID int64) (db.ContinueWatchingEntry, error)
	DeleteContinueWatching(ctx context.Context, userID string, animeID int64) error
}

type WatchlistRepository interface {
	UpsertAnime(ctx context.Context, arg db.UpsertAnimeParams) (db.Anime, error)
	GetAnime(ctx context.Context, id int64) (db.Anime, error)
	UpsertWatchListEntry(ctx context.Context, arg db.UpsertWatchListEntryParams) (db.WatchListEntry, error)
	DeleteWatchListEntry(ctx context.Context, arg db.DeleteWatchListEntryParams) error
	GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error)
	GetContinueWatchingEntry(ctx context.Context, arg db.GetContinueWatchingEntryParams) (db.ContinueWatchingEntry, error)
	DeleteContinueWatchingEntry(ctx context.Context, arg db.DeleteContinueWatchingEntryParams) error
	SaveWatchProgress(ctx context.Context, arg db.SaveWatchProgressParams) error
}
