package fixes

import (
	"context"
	"database/sql"
	"fmt"
	"mal/integrations/jikan"
	"mal/internal/config"
	"mal/internal/db"
	"mal/internal/observability"
)

func init() {
	Register(Fix{
		ID: "20260608_backfill_anime_duration_seconds",
		Apply: func(ctx context.Context, sqlDB *sql.DB) error {
			rows, err := sqlDB.QueryContext(ctx, `
SELECT id, title_original, title_english, title_japanese, image_url, airing
FROM anime
WHERE duration_seconds IS NULL;
`)
			if err != nil {
				return fmt.Errorf("query anime rows missing duration_seconds: %w", err)
			}
			defer func() { _ = rows.Close() }()

			client := jikan.NewClient(config.Config{}, db.New(sqlDB), observability.NewMetrics())

			type animeRow struct {
				id            int64
				titleOriginal string
			}

			var toUpdate []animeRow
			for rows.Next() {
				var row animeRow
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
					return fmt.Errorf("scan anime row missing duration_seconds: %w", err)
				}
				toUpdate = append(toUpdate, row)
			}
			if err := rows.Err(); err != nil {
				return fmt.Errorf("iterate anime rows missing duration_seconds: %w", err)
			}

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
		},
	})
}
