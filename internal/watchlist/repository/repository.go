package repository

import (
	"context"
	"mal/internal/db"
	"mal/internal/domain"
)

type watchlistRepository struct {
	queries *db.Queries
}

func NewWatchlistRepository(queries *db.Queries) domain.WatchlistRepository {
	return &watchlistRepository{queries: queries}
}

func (r *watchlistRepository) UpsertAnime(ctx context.Context, arg db.UpsertAnimeParams) (db.Anime, error) {
	return r.queries.UpsertAnime(ctx, arg)
}

func (r *watchlistRepository) GetAnime(ctx context.Context, id int64) (db.Anime, error) {
	return r.queries.GetAnime(ctx, id)
}

func (r *watchlistRepository) UpsertWatchListEntry(ctx context.Context, arg db.UpsertWatchListEntryParams) (db.WatchListEntry, error) {
	return r.queries.UpsertWatchListEntry(ctx, arg)
}

func (r *watchlistRepository) DeleteWatchListEntry(ctx context.Context, arg db.DeleteWatchListEntryParams) error {
	return r.queries.DeleteWatchListEntry(ctx, arg)
}

func (r *watchlistRepository) GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error) {
	return r.queries.GetUserWatchList(ctx, userID)
}

func (r *watchlistRepository) DeleteContinueWatchingEntry(ctx context.Context, arg db.DeleteContinueWatchingEntryParams) error {
	return r.queries.DeleteContinueWatchingEntry(ctx, arg)
}

func (r *watchlistRepository) SaveWatchProgress(ctx context.Context, arg db.SaveWatchProgressParams) error {
	return r.queries.SaveWatchProgress(ctx, arg)
}
