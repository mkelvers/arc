package fixes

import (
	"context"
	"database/sql"
	"fmt"

	errlog "mal/pkg"
)

func init() {
	Register(Fix{
		ID:    "20260710_backfill_continue_watching_banners",
		Apply: backfillContinueWatchingBanners,
	})
}

func backfillContinueWatchingBanners(ctx context.Context, sqlDB *sql.DB, deps Dependencies) error {
	animeIDs, err := continueWatchingAnimeMissingBanners(ctx, sqlDB)
	if err != nil {
		return err
	}
	if len(animeIDs) == 0 {
		return nil
	}
	if deps.AnimeBannerURL == nil {
		return fmt.Errorf("anime banner URL dependency is required")
	}

	for _, animeID := range animeIDs {
		bannerURL, err := deps.AnimeBannerURL(ctx, animeID)
		if err != nil {
			return fmt.Errorf("fetch banner for anime %d: %w", animeID, err)
		}
		if bannerURL == "" {
			continue
		}
		if _, err := sqlDB.ExecContext(ctx, `UPDATE anime SET banner_image_url = ? WHERE id = ? AND banner_image_url = ''`, bannerURL, animeID); err != nil {
			return fmt.Errorf("update banner for anime %d: %w", animeID, err)
		}
	}

	return nil
}

func continueWatchingAnimeMissingBanners(ctx context.Context, sqlDB *sql.DB) ([]int64, error) {
	rows, err := sqlDB.QueryContext(ctx, `
SELECT DISTINCT a.id
FROM anime a
JOIN continue_watching_entry c ON c.anime_id = a.id
WHERE a.banner_image_url = ''
	ORDER BY a.id`)
	if err != nil {
		return nil, fmt.Errorf("query continue watching anime missing banners: %w", err)
	}
	defer errlog.Close(rows, "failed to close continue watching banner backfill rows")

	var animeIDs []int64
	for rows.Next() {
		var animeID int64
		if err := rows.Scan(&animeID); err != nil {
			return nil, fmt.Errorf("scan continue watching anime missing banner: %w", err)
		}
		animeIDs = append(animeIDs, animeID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate continue watching anime missing banners: %w", err)
	}
	return animeIDs, nil
}
