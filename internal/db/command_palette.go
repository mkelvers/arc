package db

import (
	"context"
	"mal/pkg/errlog"
	"strings"
)

func (q *Queries) GetCommandPaletteContinueWatching(ctx context.Context, userID string, query string, limit int64) ([]GetContinueWatchingEntriesRow, error) {
	if userID == "" {
		return nil, nil
	}
	limit = commandPaletteLimit(limit)

	needle, pattern := commandPalettePattern(query)
	rows, err := q.db.QueryContext(ctx, `
SELECT
    c.id,
    c.user_id,
    c.anime_id,
    c.current_episode,
    c.current_time_seconds,
    c.duration_seconds,
    c.created_at,
    c.updated_at,
    a.title_original,
    a.title_english,
    a.title_japanese,
    a.image_url,
    a.duration_seconds as anime_duration_seconds
FROM continue_watching_entry c
JOIN anime a ON c.anime_id = a.id
WHERE c.user_id = ?
  AND (
    ? = ''
    OR lower(a.title_original) LIKE ?
    OR lower(coalesce(a.title_english, '')) LIKE ?
    OR lower(coalesce(a.title_japanese, '')) LIKE ?
    OR lower('Continue watching') LIKE ?
  )
ORDER BY c.updated_at DESC
LIMIT ?`, userID, needle, pattern, pattern, pattern, pattern, limit)
	if err != nil {
		return nil, err
	}
	defer errlog.Close(rows, "failed to close continue watching command palette rows")

	items := make([]GetContinueWatchingEntriesRow, 0, int(limit))
	for rows.Next() {
		item, err := scanContinueWatchingEntry(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func scanContinueWatchingEntry(rows scanner) (GetContinueWatchingEntriesRow, error) {
	var item GetContinueWatchingEntriesRow
	err := rows.Scan(
		&item.ID,
		&item.UserID,
		&item.AnimeID,
		&item.CurrentEpisode,
		&item.CurrentTimeSeconds,
		&item.DurationSeconds,
		&item.CreatedAt,
		&item.UpdatedAt,
		&item.TitleOriginal,
		&item.TitleEnglish,
		&item.TitleJapanese,
		&item.ImageUrl,
		&item.AnimeDurationSeconds,
	)
	return item, err
}

func (q *Queries) GetCommandPaletteWatchlist(ctx context.Context, userID string, query string, limit int64) ([]GetUserWatchListRow, error) {
	if userID == "" {
		return nil, nil
	}
	limit = commandPaletteLimit(limit)

	needle, pattern := commandPalettePattern(query)
	rows, err := q.db.QueryContext(ctx, `
SELECT 
    e.id,
    e.user_id,
    e.anime_id,
    e.status,
    e.created_at,
    e.updated_at,
    e.current_episode,
    e.last_episode_at,
    e.current_time_seconds,
    a.title_original,
    a.title_english,
    a.title_japanese,
    a.image_url,
    a.airing
FROM watch_list_entry e
JOIN anime a ON e.anime_id = a.id
WHERE e.user_id = ?
  AND e.status IN ('watching', 'plan_to_watch')
  AND (
    ? = ''
    OR lower(a.title_original) LIKE ?
    OR lower(coalesce(a.title_english, '')) LIKE ?
    OR lower(coalesce(a.title_japanese, '')) LIKE ?
    OR lower(e.status) LIKE ?
  )
ORDER BY
  CASE e.status
    WHEN 'watching' THEN 0
    WHEN 'plan_to_watch' THEN 1
    ELSE 2
  END,
  e.updated_at DESC
LIMIT ?`, userID, needle, pattern, pattern, pattern, pattern, limit)
	if err != nil {
		return nil, err
	}
	defer errlog.Close(rows, "failed to close watchlist command palette rows")

	items := make([]GetUserWatchListRow, 0, int(limit))
	for rows.Next() {
		item, err := scanWatchListEntry(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func scanWatchListEntry(rows scanner) (GetUserWatchListRow, error) {
	var item GetUserWatchListRow
	err := rows.Scan(
		&item.ID,
		&item.UserID,
		&item.AnimeID,
		&item.Status,
		&item.CreatedAt,
		&item.UpdatedAt,
		&item.CurrentEpisode,
		&item.LastEpisodeAt,
		&item.CurrentTimeSeconds,
		&item.TitleOriginal,
		&item.TitleEnglish,
		&item.TitleJapanese,
		&item.ImageUrl,
		&item.Airing,
	)
	return item, err
}

func commandPalettePattern(query string) (string, string) {
	needle := strings.ToLower(strings.TrimSpace(query))
	return needle, "%" + needle + "%"
}

func commandPaletteLimit(limit int64) int64 {
	if limit <= 0 {
		return 5
	}

	return limit
}

type scanner interface {
	Scan(dest ...any) error
}
