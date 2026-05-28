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
	GetWatchlistMap(ctx context.Context, userID string, animeIDs []int64) (map[int64]bool, error)
	GetCommandPaletteWatchlist(ctx context.Context, userID string, query string, limit int64) ([]UserWatchListRow, error)
	GetCommandPaletteContinueWatching(ctx context.Context, userID string, query string, limit int64) ([]db.GetContinueWatchingEntriesRow, error)
	GetWatchListEntry(ctx context.Context, userID string, animeID int64) (WatchlistEntry, error)
	GetContinueWatchingEntry(ctx context.Context, userID string, animeID int64) (db.ContinueWatchingEntry, error)
	DeleteContinueWatching(ctx context.Context, userID string, animeID int64) error
}

type WatchlistRepository interface {
	InTx(ctx context.Context, fn func(ctx context.Context, repo WatchlistRepository) error) error
	UpsertAnime(ctx context.Context, arg db.UpsertAnimeParams) (db.Anime, error)
	GetAnime(ctx context.Context, id int64) (db.Anime, error)
	UpsertWatchListEntry(ctx context.Context, arg db.UpsertWatchListEntryParams) (db.WatchListEntry, error)
	DeleteWatchListEntry(ctx context.Context, arg db.DeleteWatchListEntryParams) error
	GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error)
	GetUserWatchlistAnimeIDs(ctx context.Context, userID string, animeIDs []int64) ([]int64, error)
	GetCommandPaletteWatchlist(ctx context.Context, userID string, query string, limit int64) ([]db.GetUserWatchListRow, error)
	GetCommandPaletteContinueWatching(ctx context.Context, userID string, query string, limit int64) ([]db.GetContinueWatchingEntriesRow, error)
	GetWatchListEntry(ctx context.Context, arg db.GetWatchListEntryParams) (db.WatchListEntry, error)
	GetContinueWatchingEntry(ctx context.Context, arg db.GetContinueWatchingEntryParams) (db.ContinueWatchingEntry, error)
	DeleteContinueWatchingEntry(ctx context.Context, arg db.DeleteContinueWatchingEntryParams) error
	SaveWatchProgress(ctx context.Context, arg db.SaveWatchProgressParams) error
}
