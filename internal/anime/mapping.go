package anime

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"
)

const animeIdentityAdvisoryLock = int64(0x4d414c4944454e54)

type mappingIdentity struct {
	AniListID int
	MALID     int
}

type mappingGroup struct {
	MediaType string
	TMDBID    int64
}

type animeMapping struct {
	AniListID      int
	MALID          int
	Group          mappingGroup
	Season         int
	LogicalSeason  int
	MediaOffset    int
	DisplayOffset  int
	EpisodeCount   int
	AvailableCount int
	EpisodeMin     int
	EpisodeMax     int
	TMDBEpisodeMin int
	TMDBEpisodeMax int
	Kind           string
	SeasonLabel    string
	ReleaseDate    string
}

type animeMappingSegment struct {
	Season           int
	SourceEpisodeMin int
	SourceEpisodeMax int
	TMDBEpisodeMin   int
	TMDBEpisodeMax   int
}

type MappingStore struct {
	db *sql.DB
}

func NewMappingStore(db *sql.DB) *MappingStore {
	return &MappingStore{db: db}
}

func (s *MappingStore) Resolve(ctx context.Context, identities []mappingIdentity) (map[mappingIdentity]animeMapping, error) {
	if err := s.rememberIdentities(ctx, identities); err != nil {
		return nil, err
	}
	mappings, err := s.findMappings(ctx, identities)
	if err != nil {
		return nil, err
	}

	byAniList := make(map[int]animeMapping, len(mappings))
	byMAL := make(map[int]animeMapping, len(mappings))
	for _, mapping := range mappings {
		byAniList[mapping.AniListID] = mapping
		if mapping.MALID > 0 {
			byMAL[mapping.MALID] = mapping
		}
	}
	byIdentity := mappingsForIdentities(identities, byAniList, byMAL)
	return byIdentity, nil
}

func mappingsForIdentities(identities []mappingIdentity, byAniList map[int]animeMapping, byMAL map[int]animeMapping) map[mappingIdentity]animeMapping {
	resolved := make(map[mappingIdentity]animeMapping, len(identities))
	for _, identity := range identities {
		mapping, ok := byAniList[identity.AniListID]
		if !ok {
			mapping, ok = byMAL[identity.MALID]
		}
		if ok {
			resolved[identity] = completeMappingIdentity(mapping, identity)
		}
	}
	return resolved
}

func completeMappingIdentity(mapping animeMapping, identity mappingIdentity) animeMapping {
	if mapping.AniListID <= 0 {
		mapping.AniListID = identity.AniListID
	}
	if mapping.MALID <= 0 {
		mapping.MALID = identity.MALID
	}
	return mapping
}

func (s *MappingStore) rememberIdentities(ctx context.Context, identities []mappingIdentity) error {
	if s == nil || s.db == nil {
		return nil
	}
	seen := make(map[mappingIdentity]struct{}, len(identities))
	for _, identity := range identities {
		if identity.AniListID <= 0 || identity.MALID <= 0 {
			continue
		}
		if _, ok := seen[identity]; ok {
			continue
		}
		seen[identity] = struct{}{}
		if err := s.rememberIdentity(ctx, identity); err != nil {
			return fmt.Errorf("remember anime identity anilist=%d mal=%d: %w", identity.AniListID, identity.MALID, err)
		}
	}
	return nil
}

func (s *MappingStore) rememberIdentity(ctx context.Context, identity mappingIdentity) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin identity transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(?)`, animeIdentityAdvisoryLock); err != nil {
		return fmt.Errorf("lock identity registry: %w", err)
	}

	links := []externalAnimeID{
		{Provider: "anilist", ExternalID: fmt.Sprintf("%d", identity.AniListID)},
		{Provider: "mal", ExternalID: fmt.Sprintf("%d", identity.MALID)},
	}
	identityIDs, err := existingAnimeIdentityIDs(ctx, tx, links)
	if err != nil {
		return err
	}

	identityID, err := resolveAnimeIdentityID(ctx, tx, identityIDs)
	if err != nil {
		return err
	}

	if err := saveExternalAnimeIDs(ctx, tx, identityID, links); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit anime identity: %w", err)
	}
	return nil
}

func resolveAnimeIdentityID(ctx context.Context, tx *sql.Tx, identityIDs []int64) (int64, error) {
	if len(identityIDs) == 0 {
		var identityID int64
		if err := tx.QueryRowContext(ctx, `INSERT INTO anime_identity DEFAULT VALUES RETURNING id`).Scan(&identityID); err != nil {
			return 0, fmt.Errorf("create anime identity: %w", err)
		}
		return identityID, nil
	}
	identityID := identityIDs[0]
	if err := mergeAnimeIdentities(ctx, tx, identityID, identityIDs[1:]); err != nil {
		return 0, err
	}
	return identityID, nil
}

func saveExternalAnimeIDs(ctx context.Context, tx *sql.Tx, identityID int64, links []externalAnimeID) error {
	for _, link := range links {
		if _, err := tx.ExecContext(ctx, `INSERT INTO anime_external_id (anime_identity_id, provider, external_id)
			VALUES (?, ?, ?)
			ON CONFLICT (provider, external_id) DO NOTHING`, identityID, link.Provider, link.ExternalID); err != nil {
			return fmt.Errorf("save %s anime identity: %w", link.Provider, err)
		}
	}
	return nil
}

type externalAnimeID struct {
	Provider   string
	ExternalID string
}

func existingAnimeIdentityIDs(ctx context.Context, tx *sql.Tx, links []externalAnimeID) ([]int64, error) {
	ids := make([]int64, 0, len(links))
	seen := make(map[int64]struct{}, len(links))
	for _, link := range links {
		var id int64
		err := tx.QueryRowContext(ctx, `SELECT anime_identity_id FROM anime_external_id
			WHERE provider = ? AND external_id = ? FOR UPDATE`, link.Provider, link.ExternalID).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("find %s anime identity: %w", link.Provider, err)
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids, nil
}

func mergeAnimeIdentities(ctx context.Context, tx *sql.Tx, targetID int64, duplicateIDs []int64) error {
	for _, duplicateID := range duplicateIDs {
		conflict, err := identityMergeConflict(ctx, tx, targetID, duplicateID)
		if err != nil {
			return err
		}
		if conflict {
			return fmt.Errorf("refusing to merge conflicting anime identities %d and %d", targetID, duplicateID)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE anime_external_id SET anime_identity_id = ? WHERE anime_identity_id = ?`, targetID, duplicateID); err != nil {
			return fmt.Errorf("merge anime identity %d into %d: %w", duplicateID, targetID, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM anime_identity WHERE id = ?`, duplicateID); err != nil {
			return fmt.Errorf("delete merged anime identity %d: %w", duplicateID, err)
		}
	}
	return nil
}

func identityMergeConflict(ctx context.Context, tx *sql.Tx, leftID int64, rightID int64) (bool, error) {
	rows, err := tx.QueryContext(ctx, `SELECT provider, external_id FROM anime_external_id
		WHERE anime_identity_id IN (?, ?) ORDER BY provider, external_id`, leftID, rightID)
	if err != nil {
		return false, fmt.Errorf("query identity merge candidates: %w", err)
	}
	defer rows.Close()
	providers := map[string]string{}
	for rows.Next() {
		var provider, externalID string
		if err := rows.Scan(&provider, &externalID); err != nil {
			return false, fmt.Errorf("scan identity merge candidate: %w", err)
		}
		if existing, ok := providers[provider]; ok && existing != externalID {
			return true, nil
		}
		providers[provider] = externalID
	}
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("iterate identity merge candidates: %w", err)
	}
	return false, nil
}

func (s *MappingStore) findMappings(ctx context.Context, identities []mappingIdentity) ([]animeMapping, error) {
	anilistIDs := make([]any, 0, len(identities))
	malIDs := make([]any, 0, len(identities))
	for _, identity := range identities {
		if identity.AniListID > 0 {
			anilistIDs = append(anilistIDs, identity.AniListID)
		}
		if identity.MALID > 0 {
			malIDs = append(malIDs, identity.MALID)
		}
	}
	if len(anilistIDs) == 0 && len(malIDs) == 0 {
		return nil, nil
	}

	clauses := make([]string, 0, 2)
	args := make([]any, 0, len(anilistIDs)+len(malIDs))
	if len(anilistIDs) > 0 {
		clauses = append(clauses, "anilist_id IN ("+questionMarks(len(anilistIDs))+")")
		args = append(args, anilistIDs...)
	}
	if len(malIDs) > 0 {
		clauses = append(clauses, "mal_id IN ("+questionMarks(len(malIDs))+")")
		args = append(args, malIDs...)
	}
	query := `SELECT anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season
		FROM anime_effective_mapping WHERE ` + strings.Join(clauses, " OR ")
	return scanMappings(ctx, s.db, query, args...)
}

func (s *MappingStore) GroupMappings(ctx context.Context, group mappingGroup) ([]animeMapping, error) {
	if group.MediaType == "" || group.TMDBID <= 0 {
		return nil, nil
	}
	query := `SELECT anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season
		FROM anime_effective_mapping WHERE tmdb_media_type = ? AND tmdb_id = ?
		ORDER BY tmdb_season, anilist_id, mal_id`
	return scanMappings(ctx, s.db, query, group.MediaType, group.TMDBID)
}

func (s *MappingStore) MappingSegments(ctx context.Context, group mappingGroup, anilistIDs []int) (map[int][]animeMappingSegment, error) {
	segments := make(map[int][]animeMappingSegment)
	if !mappingSegmentQueryReady(s, group, anilistIDs) {
		return segments, nil
	}
	args := make([]any, 0, len(anilistIDs)+2)
	args = append(args, group.MediaType, group.TMDBID)
	for _, id := range anilistIDs {
		args = append(args, id)
	}
	query := `SELECT anilist_id, tmdb_season, source_episode_min, source_episode_max, tmdb_episode_min, tmdb_episode_max
		FROM anime_external_mapping_segment
		WHERE tmdb_media_type = ? AND tmdb_id = ? AND anilist_id IN (` + questionMarks(len(anilistIDs)) + `)
		ORDER BY anilist_id, tmdb_season, source_episode_min`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query anime mapping segments: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var anilistID int
		var segment animeMappingSegment
		if err := rows.Scan(&anilistID, &segment.Season, &segment.SourceEpisodeMin, &segment.SourceEpisodeMax, &segment.TMDBEpisodeMin, &segment.TMDBEpisodeMax); err != nil {
			return nil, fmt.Errorf("scan anime mapping segment: %w", err)
		}
		segments[anilistID] = append(segments[anilistID], segment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate anime mapping segments: %w", err)
	}
	return segments, nil
}

func mappingSegmentQueryReady(store *MappingStore, group mappingGroup, anilistIDs []int) bool {
	return store != nil && store.db != nil && group.MediaType != "" && group.TMDBID > 0 && len(anilistIDs) > 0
}

type mappingQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func scanMappings(ctx context.Context, db mappingQueryer, query string, args ...any) ([]animeMapping, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query anime mappings: %w", err)
	}
	defer rows.Close()
	var mappings []animeMapping
	for rows.Next() {
		var mapping animeMapping
		var malID sql.NullInt64
		if err := rows.Scan(&mapping.AniListID, &malID, &mapping.Group.MediaType, &mapping.Group.TMDBID, &mapping.Season); err != nil {
			return nil, fmt.Errorf("scan anime mapping: %w", err)
		}
		if malID.Valid {
			mapping.MALID = int(malID.Int64)
		}
		mappings = append(mappings, mapping)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate anime mappings: %w", err)
	}
	return mappings, nil
}

func questionMarks(count int) string {
	return strings.TrimSuffix(strings.Repeat("?,", count), ",")
}
