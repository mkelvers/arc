package anime

import (
	"context"
	"mal/internal/database/db"
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

func (r *animeRepository) GetContinueWatchingCarouselEntries(ctx context.Context, userID string, limit int64) ([]db.GetContinueWatchingEntriesRow, error) {
	rows, err := r.queries.GetContinueWatchingCarouselEntries(ctx, db.GetContinueWatchingCarouselEntriesParams{
		UserID: userID,
		Limit:  limit,
	})
	if err != nil {
		return nil, err
	}
	entries := make([]db.GetContinueWatchingEntriesRow, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, db.GetContinueWatchingEntriesRow(row))
	}
	return entries, nil
}
