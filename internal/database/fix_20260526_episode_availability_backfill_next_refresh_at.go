package database

import (
	"context"
	"database/sql"
	"fmt"
)

func init() {
	registerDataFix(dataFix{
		id: "20260526_episode_availability_backfill_next_refresh_at",
		apply: func(ctx context.Context, sqlDB *sql.DB) error {
			// Old caches could have next_refresh_at NULL (especially for airing shows with missing broadcast metadata),
			// which can result in "never refresh again" behavior on the server.
			_, err := sqlDB.ExecContext(ctx, `
UPDATE episode_availability_cache
SET next_refresh_at = datetime(CURRENT_TIMESTAMP, '+6 hours'),
    updated_at = CURRENT_TIMESTAMP
WHERE next_refresh_at IS NULL;
`)
			if err != nil {
				return fmt.Errorf("backfill episode_availability_cache.next_refresh_at: %w", err)
			}
			return nil
		},
	})
}
