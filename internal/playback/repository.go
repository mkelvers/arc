package playback

import (
	"context"
	"database/sql"
	"mal/internal/db"
	"mal/internal/dbtx"
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
	return dbtx.Run(ctx, r.sqlDB, domain.PlaybackRepository(r), func(tx *sql.Tx) domain.PlaybackRepository {
		return &playbackRepository{sqlDB: nil, queries: r.queries.WithTx(tx)}
	}, fn)
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
