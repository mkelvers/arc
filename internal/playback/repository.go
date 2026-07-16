package playback

import (
	"context"
	"database/sql"
	"errors"
	"mal/internal/database/db"
	"mal/internal/domain"
)

type playbackRepository struct {
	sqlDB   *sql.DB
	queries *db.Queries
}

func NewPlaybackRepository(sqlDB *sql.DB, queries *db.Queries) domain.PlaybackRepository {
	return &playbackRepository{sqlDB: sqlDB, queries: queries}
}

func (r *playbackRepository) InTx(ctx context.Context, fn func(ctx context.Context, repo domain.PlaybackRepository) error) error {
	if r.sqlDB == nil {
		return fn(ctx, r)
	}

	tx, err := r.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	txRepo := &playbackRepository{sqlDB: nil, queries: r.queries.WithTx(tx)}
	if err := fn(ctx, txRepo); err != nil {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return errors.Join(err, rollbackErr)
		}
		return err
	}

	return tx.Commit()
}

func (r *playbackRepository) UpsertAnime(ctx context.Context, params db.UpsertAnimeParams) (db.Anime, error) {
	return r.queries.UpsertAnime(ctx, params)
}

func (r *playbackRepository) GetAnime(ctx context.Context, id int64) (db.Anime, error) {
	return r.queries.GetAnime(ctx, id)
}

func (r *playbackRepository) GetAnimeMappingByMALID(ctx context.Context, malID int64) (domain.AnimeMediaMapping, error) {
	const query = `SELECT anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season, canonical
		FROM anime_effective_mapping
		WHERE mal_id = ?
		ORDER BY canonical DESC, tmdb_season, anilist_id
		LIMIT 1`
	return scanAnimeMediaMapping(ctx, r.sqlDB, query, malID)
}

func (r *playbackRepository) GetCanonicalAnimeMapping(ctx context.Context, mediaType string, tmdbID int64) (domain.AnimeMediaMapping, error) {
	const query = `SELECT anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season, canonical
		FROM anime_effective_mapping
		WHERE tmdb_media_type = ? AND tmdb_id = ? AND mal_id IS NOT NULL
		ORDER BY canonical DESC,
			CASE
				WHEN tmdb_media_type = 'movie' THEN 0
				WHEN tmdb_season = 1 THEN 0
				WHEN tmdb_season > 1 THEN 100 + tmdb_season
				WHEN tmdb_season = 0 THEN 1000
				ELSE 2000
			END,
			anilist_id
		LIMIT 1`
	return scanAnimeMediaMapping(ctx, r.sqlDB, query, mediaType, tmdbID)
}

func (r *playbackRepository) GetAnimeMappingsForGroup(ctx context.Context, mediaType string, tmdbID int64) ([]domain.AnimeMediaMapping, error) {
	const query = `SELECT anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season, canonical
		FROM anime_effective_mapping
		WHERE tmdb_media_type = ? AND tmdb_id = ? AND mal_id IS NOT NULL
		ORDER BY tmdb_season, anilist_id, mal_id`
	rows, err := r.sqlDB.QueryContext(ctx, query, mediaType, tmdbID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mappings []domain.AnimeMediaMapping
	for rows.Next() {
		mapping, err := scanAnimeMediaMappingRow(rows)
		if err != nil {
			return nil, err
		}
		mappings = append(mappings, mapping)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return mappings, nil
}

func (r *playbackRepository) GetAnimeMappingSegments(ctx context.Context, mapping domain.AnimeMediaMapping) ([]domain.AnimeMediaSegment, error) {
	const query = `SELECT tmdb_season, source_episode_min, source_episode_max, tmdb_episode_min, tmdb_episode_max
		FROM anime_external_mapping_segment
		WHERE anilist_id = ? AND tmdb_media_type = ? AND tmdb_id = ?
		ORDER BY tmdb_season, source_episode_min`
	rows, err := r.sqlDB.QueryContext(ctx, query, mapping.AniListID, mapping.MediaType, mapping.TMDBID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var segments []domain.AnimeMediaSegment
	for rows.Next() {
		var segment domain.AnimeMediaSegment
		if err := rows.Scan(&segment.Season, &segment.SourceEpisodeMin, &segment.SourceEpisodeMax, &segment.TMDBEpisodeMin, &segment.TMDBEpisodeMax); err != nil {
			return nil, err
		}
		segments = append(segments, segment)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return segments, nil
}

func (r *playbackRepository) GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error) {
	return r.queries.GetWatchListEntry(ctx, params)
}

func (r *playbackRepository) GetContinueWatchingEntry(ctx context.Context, params db.GetContinueWatchingEntryParams) (db.ContinueWatchingEntry, error) {
	return r.queries.GetContinueWatchingEntry(ctx, params)
}

func (r *playbackRepository) SaveWatchProgress(ctx context.Context, params db.SaveWatchProgressParams) error {
	return r.queries.SaveWatchProgress(ctx, params)
}

func (r *playbackRepository) UpsertWatchListEntry(ctx context.Context, params db.UpsertWatchListEntryParams) (db.WatchListEntry, error) {
	return r.queries.UpsertWatchListEntry(ctx, params)
}

func (r *playbackRepository) UpsertContinueWatchingEntry(ctx context.Context, params db.UpsertContinueWatchingEntryParams) (db.ContinueWatchingEntry, error) {
	return r.queries.UpsertContinueWatchingEntry(ctx, params)
}

func (r *playbackRepository) DeleteContinueWatchingEntry(ctx context.Context, params db.DeleteContinueWatchingEntryParams) error {
	return r.queries.DeleteContinueWatchingEntry(ctx, params)
}

func (r *playbackRepository) ListSkipSegmentOverrides(ctx context.Context, userID string, animeID int64, episode int64) ([]db.SkipSegmentOverrideRow, error) {
	return r.queries.ListSkipSegmentOverrides(ctx, userID, animeID, episode)
}

func (r *playbackRepository) UpsertSkipSegmentOverride(ctx context.Context, s db.SkipSegmentOverrideRow) error {
	return r.queries.UpsertSkipSegmentOverride(ctx, s)
}

func (r *playbackRepository) HasSkipSegmentOverrideTable(ctx context.Context) (bool, error) {
	return r.queries.HasSkipSegmentOverrideTable(ctx)
}

type animeMediaMappingScanner interface {
	Scan(dest ...any) error
}

func scanAnimeMediaMapping(ctx context.Context, db *sql.DB, query string, args ...any) (domain.AnimeMediaMapping, error) {
	row := db.QueryRowContext(ctx, query, args...)
	return scanAnimeMediaMappingRow(row)
}

func scanAnimeMediaMappingRow(row animeMediaMappingScanner) (domain.AnimeMediaMapping, error) {
	var mapping domain.AnimeMediaMapping
	var malID sql.NullInt64
	if err := row.Scan(&mapping.AniListID, &malID, &mapping.MediaType, &mapping.TMDBID, &mapping.Season, &mapping.Canonical); err != nil {
		return domain.AnimeMediaMapping{}, err
	}
	if malID.Valid {
		mapping.MALID = malID.Int64
	}
	return mapping, nil
}
