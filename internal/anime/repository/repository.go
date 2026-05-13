package repository

import (
	"context"
	"mal/internal/db"
	"mal/internal/domain"
)

type animeRepository struct {
	queries *db.Queries
}

func NewAnimeRepository(queries *db.Queries) domain.AnimeRepository {
	return &animeRepository{queries: queries}
}

func (r *animeRepository) GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error) {
	return r.queries.GetUserWatchList(ctx, userID)
}

func (r *animeRepository) GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error) {
	return r.queries.GetWatchListEntry(ctx, params)
}

func (r *animeRepository) GetContinueWatchingEntries(ctx context.Context, userID string) ([]db.GetContinueWatchingEntriesRow, error) {
	return r.queries.GetContinueWatchingEntries(ctx, userID)
}
