package fixes

import (
	"context"
	"database/sql"
	"fmt"
)

func init() {
	Register(Fix{
		ID:    "20260716_correct_duplicate_anime_mapping_segments",
		Apply: correctDuplicateAnimeMappingSegments,
	})
}

func correctDuplicateAnimeMappingSegments(ctx context.Context, sqlDB *sql.DB, _ Dependencies) error {
	tx, err := sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin duplicate anime mapping segment correction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := correctImportedDuplicateAnimeMappingSegments(ctx, tx); err != nil {
		return err
	}
	if err := correctInferredAnimeMappingSeasons(ctx, tx); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit duplicate anime mapping segment correction: %w", err)
	}
	return nil
}

func correctImportedDuplicateAnimeMappingSegments(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `
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
preferred AS (
    SELECT DISTINCT ON (segment.anilist_id, segment.tmdb_media_type, segment.tmdb_id)
        segment.anilist_id,
        segment.tmdb_media_type,
        segment.tmdb_id,
        segment.tmdb_season
    FROM anime_external_mapping_segment AS segment
    JOIN duplicate_sources AS duplicate
      ON duplicate.anilist_id = segment.anilist_id
     AND duplicate.tmdb_media_type = segment.tmdb_media_type
     AND duplicate.tmdb_id = segment.tmdb_id
     AND duplicate.source_episode_min = segment.source_episode_min
     AND duplicate.source_episode_max = segment.source_episode_max
    WHERE segment.source_episode_min = segment.tmdb_episode_min
      AND segment.source_episode_max = segment.tmdb_episode_max
    ORDER BY segment.anilist_id, segment.tmdb_media_type, segment.tmdb_id, segment.tmdb_season DESC
)
UPDATE anime_external_mapping AS mapping
SET tmdb_season = preferred.tmdb_season
FROM preferred
WHERE mapping.anilist_id = preferred.anilist_id
  AND mapping.tmdb_media_type = preferred.tmdb_media_type
  AND mapping.tmdb_id = preferred.tmdb_id
  AND mapping.tmdb_season <> preferred.tmdb_season
`); err != nil {
		return fmt.Errorf("correct imported duplicate anime mapping segments: %w", err)
	}
	return nil
}

func correctInferredAnimeMappingSeasons(ctx context.Context, tx *sql.Tx) error {
	for range 8 {
		if _, err := tx.ExecContext(ctx, `
WITH related AS (
    SELECT
        inferred.anilist_id,
        CASE
            WHEN UPPER(inferred.relation_type) = 'PREQUEL' THEN source.tmdb_season + 1
            WHEN UPPER(inferred.relation_type) = 'SEQUEL' AND source.tmdb_season > 1 THEN source.tmdb_season - 1
            WHEN UPPER(inferred.relation_type) = 'SEQUEL' THEN 1
            ELSE inferred.tmdb_season
        END AS corrected_season
    FROM anime_inferred_mapping AS inferred
    JOIN anime_effective_mapping AS source
      ON source.anilist_id = inferred.related_anilist_id
    WHERE inferred.tmdb_media_type = 'tv'
      AND source.tmdb_media_type = 'tv'
      AND source.tmdb_season > 0
      AND UPPER(inferred.relation_type) IN ('PREQUEL', 'SEQUEL')
)
UPDATE anime_inferred_mapping AS inferred
SET tmdb_season = related.corrected_season
FROM related
WHERE inferred.anilist_id = related.anilist_id
  AND inferred.tmdb_season <> related.corrected_season
`); err != nil {
			return fmt.Errorf("correct inferred anime mapping seasons: %w", err)
		}
	}
	return nil
}
