package watchlist

import (
	"context"
	"database/sql"
	"errors"
	"mal/internal/db"
	"mal/internal/domain"
)

type watchlistRepository struct {
	sqlDB   *sql.DB
	queries *db.Queries
}

func NewWatchlistRepository(sqlDB *sql.DB, queries *db.Queries) domain.WatchlistRepository {
	return &watchlistRepository{sqlDB: sqlDB, queries: queries}
}

func (r *watchlistRepository) InTx(ctx context.Context, fn func(ctx context.Context, repo domain.WatchlistRepository) error) error {
	if r.sqlDB == nil {
		return fn(ctx, r)
	}

	tx, err := r.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	txRepo := &watchlistRepository{sqlDB: nil, queries: r.queries.WithTx(tx)}
	if err := fn(ctx, txRepo); err != nil {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return errors.Join(err, rollbackErr)
		}
		return err
	}

	return tx.Commit()
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

func (r *watchlistRepository) GetUserWatchlistAnimeIDs(ctx context.Context, userID string, animeIDs []int64) ([]int64, error) {
	return r.queries.GetUserWatchlistAnimeIDs(ctx, userID, animeIDs)
}

func (r *watchlistRepository) GetWatchListEntry(ctx context.Context, arg db.GetWatchListEntryParams) (db.WatchListEntry, error) {
	return r.queries.GetWatchListEntry(ctx, arg)
}

func (r *watchlistRepository) GetContinueWatchingEntry(ctx context.Context, arg db.GetContinueWatchingEntryParams) (db.ContinueWatchingEntry, error) {
	return r.queries.GetContinueWatchingEntry(ctx, arg)
}

func (r *watchlistRepository) DeleteContinueWatchingEntry(ctx context.Context, arg db.DeleteContinueWatchingEntryParams) error {
	return r.queries.DeleteContinueWatchingEntry(ctx, arg)
}

func (r *watchlistRepository) SaveWatchProgress(ctx context.Context, arg db.SaveWatchProgressParams) error {
	return r.queries.SaveWatchProgress(ctx, arg)
}
