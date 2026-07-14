package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	errlog "mal/pkg"
)

type SkipSegmentOverrideRow struct {
	ID        string
	UserID    string
	AnimeID   int64
	Episode   int64
	SkipType  string
	StartTime float64
	EndTime   float64
}

func (q *Queries) ListSkipSegmentOverrides(ctx context.Context, userID string, animeID int64, episode int64) ([]SkipSegmentOverrideRow, error) {
	const query = `
SELECT id, user_id, anime_id, episode, skip_type, start_time, end_time
FROM skip_segment_override
WHERE user_id = ? AND anime_id = ? AND episode = ?
ORDER BY skip_type ASC;
`
	rows, err := q.db.QueryContext(ctx, query, userID, animeID, episode)
	if err != nil {
		return nil, fmt.Errorf("list skip segment overrides: %w", err)
	}
	defer errlog.Close(rows, "failed to close skip segment override rows")

	var out []SkipSegmentOverrideRow
	for rows.Next() {
		var r SkipSegmentOverrideRow
		if err := rows.Scan(&r.ID, &r.UserID, &r.AnimeID, &r.Episode, &r.SkipType, &r.StartTime, &r.EndTime); err != nil {
			return nil, fmt.Errorf("scan skip segment override: %w", err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate skip segment overrides: %w", err)
	}
	return out, nil
}

func (q *Queries) UpsertSkipSegmentOverride(ctx context.Context, r SkipSegmentOverrideRow) error {
	const query = `
INSERT INTO skip_segment_override (id, user_id, anime_id, episode, skip_type, start_time, end_time)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id, anime_id, episode, skip_type) DO UPDATE SET
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  updated_at = CURRENT_TIMESTAMP;
`
	_, err := q.db.ExecContext(ctx, query, r.ID, r.UserID, r.AnimeID, r.Episode, r.SkipType, r.StartTime, r.EndTime)
	if err != nil {
		return fmt.Errorf("upsert skip segment override: %w", err)
	}
	return nil
}

func (q *Queries) HasSkipSegmentOverrideTable(ctx context.Context) (bool, error) {
	// Defensive: in case the schema has not been prepared yet in some env.
	const query = `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = current_schema() AND tablename = 'skip_segment_override' LIMIT 1;`
	var name sql.NullString
	if err := q.db.QueryRowContext(ctx, query).Scan(&name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("check skip segment override table: %w", err)
	}
	return name.Valid && name.String != "", nil
}
