package playback

import (
	"context"
	"database/sql"
	"errors"
	"mal/internal/database/db"
	"mal/internal/domain"
)

type playbackRepository struct {
	sqlDB   *sql.DB
	queries *db.Queries
}

func NewPlaybackRepository(sqlDB *sql.DB, queries *db.Queries) domain.PlaybackRepository {
	return &playbackRepository{sqlDB: sqlDB, queries: queries}
}

func (r *playbackRepository) InTx(ctx context.Context, fn func(ctx context.Context, repo domain.PlaybackRepository) error) error {
	if r.sqlDB == nil {
		return fn(ctx, r)
	}

	tx, err := r.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	txRepo := &playbackRepository{sqlDB: nil, queries: r.queries.WithTx(tx)}
	if err := fn(ctx, txRepo); err != nil {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return errors.Join(err, rollbackErr)
		}
		return err
	}

	return tx.Commit()
}

func (r *playbackRepository) UpsertAnime(ctx context.Context, params db.UpsertAnimeParams) (db.Anime, error) {
	return r.queries.UpsertAnime(ctx, params)
}

func (r *playbackRepository) GetAnime(ctx context.Context, id int64) (db.Anime, error) {
	return r.queries.GetAnime(ctx, id)
}

func (r *playbackRepository) GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error) {
	return r.queries.GetWatchListEntry(ctx, params)
}

func (r *playbackRepository) GetContinueWatchingEntry(ctx context.Context, params db.GetContinueWatchingEntryParams) (db.ContinueWatchingEntry, error) {
	return r.queries.GetContinueWatchingEntry(ctx, params)
}

func (r *playbackRepository) SaveWatchProgress(ctx context.Context, params db.SaveWatchProgressParams) error {
	return r.queries.SaveWatchProgress(ctx, params)
}

func (r *playbackRepository) UpsertWatchListEntry(ctx context.Context, params db.UpsertWatchListEntryParams) (db.WatchListEntry, error) {
	return r.queries.UpsertWatchListEntry(ctx, params)
}

func (r *playbackRepository) UpsertContinueWatchingEntry(ctx context.Context, params db.UpsertContinueWatchingEntryParams) (db.ContinueWatchingEntry, error) {
	return r.queries.UpsertContinueWatchingEntry(ctx, params)
}

func (r *playbackRepository) DeleteContinueWatchingEntry(ctx context.Context, params db.DeleteContinueWatchingEntryParams) error {
	return r.queries.DeleteContinueWatchingEntry(ctx, params)
}

func (r *playbackRepository) ListSkipSegmentOverrides(ctx context.Context, userID string, animeID int64, episode int64) ([]db.SkipSegmentOverrideRow, error) {
	return r.queries.ListSkipSegmentOverrides(ctx, userID, animeID, episode)
}

func (r *playbackRepository) UpsertSkipSegmentOverride(ctx context.Context, s db.SkipSegmentOverrideRow) error {
	return r.queries.UpsertSkipSegmentOverride(ctx, s)
}

func (r *playbackRepository) HasSkipSegmentOverrideTable(ctx context.Context) (bool, error) {
	return r.queries.HasSkipSegmentOverrideTable(ctx)
}
