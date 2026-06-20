package fixes

import (
	"context"
	"database/sql"
	"fmt"
	"mal/integrations/jikan"
	"mal/internal/config"
	"mal/internal/db"
	"mal/internal/observability"
	errlog "mal/pkg"
)

type animeDurationRow struct {
	id            int64
	titleOriginal string
}

func init() {
	Register(Fix{
		ID: "20260608_backfill_anime_duration_seconds",
		Apply: func(ctx context.Context, sqlDB *sql.DB, _ Dependencies) error {
			return applyAnimeDurationSecondsBackfill(ctx, sqlDB)
		},
	})
}

func applyAnimeDurationSecondsBackfill(ctx context.Context, sqlDB *sql.DB) error {
	toUpdate, err := listAnimeMissingDurationSeconds(ctx, sqlDB)
	if err != nil {
		return fmt.Errorf("list anime missing duration_seconds: %w", err)
	}

	client := jikan.NewClient(config.Config{}, db.New(sqlDB), observability.NewMetrics())
	for _, row := range toUpdate {
		anime, err := client.GetAnimeByID(ctx, int(row.id))
		if err != nil {
			return fmt.Errorf("fetch anime %d for duration backfill: %w", row.id, err)
		}

		durationSeconds := anime.DurationSeconds()
		if durationSeconds <= 0 {
			continue
		}

		if _, err := sqlDB.ExecContext(
			ctx,
			`UPDATE anime SET duration_seconds = ? WHERE id = ? AND duration_seconds IS NULL`,
			durationSeconds,
			row.id,
		); err != nil {
			return fmt.Errorf("update anime %d duration_seconds: %w", row.id, err)
		}
	}

	return nil
}

func listAnimeMissingDurationSeconds(ctx context.Context, sqlDB *sql.DB) ([]animeDurationRow, error) {
	rows, err := sqlDB.QueryContext(ctx, `
SELECT id, title_original, title_english, title_japanese, image_url, airing
FROM anime
WHERE duration_seconds IS NULL;
`)
	if err != nil {
		return nil, fmt.Errorf("query anime rows missing duration_seconds: %w", err)
	}
	defer errlog.Close(rows, "failed to close anime duration backfill rows")

	var toUpdate []animeDurationRow
	for rows.Next() {
		var row animeDurationRow
		var titleEnglish sql.NullString
		var titleJapanese sql.NullString
		var imageURL string
		var airing sql.NullBool
		if err := rows.Scan(
			&row.id,
			&row.titleOriginal,
			&titleEnglish,
			&titleJapanese,
			&imageURL,
			&airing,
		); err != nil {
			return nil, fmt.Errorf("scan anime row missing duration_seconds: %w", err)
		}
		toUpdate = append(toUpdate, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate anime rows missing duration_seconds: %w", err)
	}

	return toUpdate, nil
}
