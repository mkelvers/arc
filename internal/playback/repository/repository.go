package repository

import (
	"context"
	"mal/internal/db"
	"mal/internal/domain"
)

type playbackRepository struct {
	queries *db.Queries
}

func NewPlaybackRepository(queries *db.Queries) domain.PlaybackRepository {
	return &playbackRepository{queries: queries}
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
