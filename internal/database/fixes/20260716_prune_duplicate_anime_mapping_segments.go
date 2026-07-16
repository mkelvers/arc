package fixes

import (
	"context"
	"database/sql"
	"fmt"
)

func init() {
	Register(Fix{
		ID:    "20260716_prune_duplicate_anime_mapping_segments",
		Apply: pruneDuplicateAnimeMappingSegments,
	})
}

func pruneDuplicateAnimeMappingSegments(ctx context.Context, sqlDB *sql.DB, _ Dependencies) error {
	_, err := sqlDB.ExecContext(ctx, `
WITH duplicate_sources AS (
    SELECT
        anilist_id,
        tmdb_media_type,
        tmdb_id,
        source_episode_min,
        source_episode_max
    FROM anime_external_mapping_segment
    WHERE source_episode_min > 0
      AND source_episode_max > 0
    GROUP BY anilist_id, tmdb_media_type, tmdb_id, source_episode_min, source_episode_max
    HAVING COUNT(*) > 1
),
preferred_sources AS (
    SELECT DISTINCT
        segment.anilist_id,
        segment.tmdb_media_type,
        segment.tmdb_id,
        segment.source_episode_min,
        segment.source_episode_max
    FROM anime_external_mapping_segment AS segment
    JOIN duplicate_sources AS duplicate
      ON duplicate.anilist_id = segment.anilist_id
     AND duplicate.tmdb_media_type = segment.tmdb_media_type
     AND duplicate.tmdb_id = segment.tmdb_id
     AND duplicate.source_episode_min = segment.source_episode_min
     AND duplicate.source_episode_max = segment.source_episode_max
    WHERE segment.source_episode_min = segment.tmdb_episode_min
      AND segment.source_episode_max = segment.tmdb_episode_max
)
DELETE FROM anime_external_mapping_segment AS segment
USING preferred_sources AS preferred
WHERE segment.anilist_id = preferred.anilist_id
  AND segment.tmdb_media_type = preferred.tmdb_media_type
  AND segment.tmdb_id = preferred.tmdb_id
  AND segment.source_episode_min = preferred.source_episode_min
  AND segment.source_episode_max = preferred.source_episode_max
  AND NOT (
      segment.source_episode_min = segment.tmdb_episode_min
      AND segment.source_episode_max = segment.tmdb_episode_max
  )
`)
	if err != nil {
		return fmt.Errorf("prune duplicate anime mapping segments: %w", err)
	}
	return nil
}
