package fixes

import (
	"context"
	"database/sql"
	"fmt"
)

func init() {
	Register(Fix{
		ID:    "20260717_prune_contained_anime_mapping_segments",
		Apply: pruneContainedAnimeMappingSegments,
	})
}

func pruneContainedAnimeMappingSegments(ctx context.Context, sqlDB *sql.DB, _ Dependencies) error {
	_, err := sqlDB.ExecContext(ctx, `
DELETE FROM anime_external_mapping_segment AS segment
USING anime_external_mapping_segment AS containing
WHERE containing.anilist_id = segment.anilist_id
  AND containing.tmdb_media_type = segment.tmdb_media_type
  AND containing.tmdb_id = segment.tmdb_id
  AND containing.source_episode_min > 0
  AND containing.source_episode_max > 0
  AND segment.source_episode_min > 0
  AND segment.source_episode_max > 0
  AND containing.source_episode_min <= segment.source_episode_min
  AND containing.source_episode_max >= segment.source_episode_max
  AND (
      containing.source_episode_min < segment.source_episode_min
      OR containing.source_episode_max > segment.source_episode_max
  )
`)
	if err != nil {
		return fmt.Errorf("prune contained anime mapping segments: %w", err)
	}
	return nil
}
