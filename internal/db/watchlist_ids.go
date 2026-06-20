package db

import (
	"context"
	errlog "mal/pkg"
	"strings"
)

func (q *Queries) GetUserWatchlistAnimeIDs(ctx context.Context, userID string, animeIDs []int64) ([]int64, error) {
	animeIDs = uniquePositiveIDs(animeIDs)
	if userID == "" || len(animeIDs) == 0 {
		return nil, nil
	}

	placeholders := strings.TrimRight(strings.Repeat("?,", len(animeIDs)), ",")
	query := "SELECT anime_id FROM watch_list_entry WHERE user_id = ? AND anime_id IN (" + placeholders + ") ORDER BY anime_id"

	args := make([]any, 0, len(animeIDs)+1)
	args = append(args, userID)
	for _, animeID := range animeIDs {
		args = append(args, animeID)
	}

	rows, err := q.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer errlog.Close(rows, "failed to close watchlist id rows")

	matches := make([]int64, 0, len(animeIDs))
	for rows.Next() {
		var animeID int64
		if err := rows.Scan(&animeID); err != nil {
			return nil, err
		}
		matches = append(matches, animeID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return matches, nil
}

func uniquePositiveIDs(ids []int64) []int64 {
	seen := make(map[int64]struct{}, len(ids))
	unique := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	return unique
}
