package anime

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mal/integrations/anilist"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.uber.org/fx"
)

const (
	aniBridgeMappingsURL = "https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json"
	mappingSource        = "anibridge/anibridge-mappings"
	mappingSchemaVersion = "v3"
	mappingRefreshAge    = 7 * 24 * time.Hour
	mappingCheckInterval = time.Hour
	mappingMaxBytes      = 64 << 20
	mappingAdvisoryLock  = int64(0x4d414c4d415050)
)

type importedMapping struct {
	AniListID   int64
	MALID       *int64
	MALVerified bool
	MALRanges   map[int64][]importedEpisodeRange
	MediaType   string
	TMDBID      int64
	Season      int
	Segments    []importedMappingSegment
}

type importedEpisodeRange struct {
	SourceEpisodeMin int
	SourceEpisodeMax int
	TargetEpisodeMin int
	TargetEpisodeMax int
}

type importedMappingSegment struct {
	Season           int
	SourceEpisodeMin int
	SourceEpisodeMax int
	TMDBEpisodeMin   int
	TMDBEpisodeMax   int
}

type mappingImportStatus struct {
	ETag       string
	ImportedAt time.Time
	Exists     bool
}

type MappingSyncer struct {
	db               *sql.DB
	httpClient       *http.Client
	identityProvider mappingIdentityProvider
	sourceURL        string
	now              func() time.Time
	mu               sync.Mutex
}

type mappingIdentityProvider interface {
	GetMALIDsByAniListID(context.Context, []int) (map[int]int, error)
}

func NewMappingSyncer(db *sql.DB, identityProvider *anilist.Client) *MappingSyncer {
	return &MappingSyncer{
		db:               db,
		httpClient:       &http.Client{Timeout: 2 * time.Minute},
		identityProvider: identityProvider,
		sourceURL:        aniBridgeMappingsURL,
		now:              time.Now,
	}
}

func RegisterMappingSync(lifecycle fx.Lifecycle, syncer *MappingSyncer) {
	var cancel context.CancelFunc
	lifecycle.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			status, err := syncer.status(ctx)
			if err != nil {
				return err
			}
			if !status.Exists {
				if err := syncer.Sync(ctx); err != nil {
					return fmt.Errorf("initial anime mapping import: %w", err)
				}
			}
			workerCtx, stop := context.WithCancel(context.Background())
			cancel = stop
			go syncer.run(workerCtx)
			return nil
		},
		OnStop: func(context.Context) error {
			if cancel != nil {
				cancel()
			}
			return nil
		},
	})
}

func (s *MappingSyncer) run(ctx context.Context) {
	ticker := time.NewTicker(mappingCheckInterval)
	defer ticker.Stop()
	s.refreshIfStale(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.refreshIfStale(ctx)
		}
	}
}

func (s *MappingSyncer) refreshIfStale(ctx context.Context) {
	status, err := s.status(ctx)
	if err != nil {
		slog.WarnContext(ctx, "anime_mapping_status_failed", "component", "anime", "error", err)
		return
	}
	if status.Exists && s.now().Sub(status.ImportedAt) < mappingRefreshAge {
		return
	}
	if err := s.Sync(ctx); err != nil {
		slog.WarnContext(ctx, "anime_mapping_refresh_failed", "component", "anime", "error", err)
	}
}

func (s *MappingSyncer) Sync(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	status, err := s.status(ctx)
	if err != nil {
		return err
	}
	mappings, etag, unchanged, err := s.download(ctx, status.ETag)
	if err != nil {
		return err
	}
	if unchanged {
		return s.markChecked(ctx)
	}
	if len(mappings) == 0 {
		return errors.New("AniBridge mapping payload contained no usable mappings")
	}
	if err := s.replace(ctx, mappings, etag); err != nil {
		return err
	}
	slog.Info("anime_mapping_refresh_completed", "component", "anime", "fields", map[string]any{"entries": len(mappings), "source": mappingSource})
	return nil
}

// ForceSync downloads and replaces the mapping snapshot even when its ETag has
// not changed. It is intended for explicit maintenance after identity resolver
// changes, where the source payload is unchanged but derived IDs must be rebuilt.
func (s *MappingSyncer) ForceSync(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	mappings, etag, _, err := s.download(ctx, "")
	if err != nil {
		return err
	}
	if len(mappings) == 0 {
		return errors.New("AniBridge mapping payload contained no usable mappings")
	}
	if err := s.replace(ctx, mappings, etag); err != nil {
		return err
	}
	slog.Info("anime_mapping_force_refresh_completed", "component", "anime", "fields", map[string]any{"entries": len(mappings), "source": mappingSource})
	return nil
}

func (s *MappingSyncer) download(ctx context.Context, etag string) ([]importedMapping, string, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.sourceURL, nil)
	if err != nil {
		return nil, "", false, fmt.Errorf("create AniBridge mapping request: %w", err)
	}
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}
	response, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", false, fmt.Errorf("download AniBridge mappings: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotModified {
		return nil, etag, true, nil
	}
	if response.StatusCode != http.StatusOK {
		return nil, "", false, fmt.Errorf("download AniBridge mappings: HTTP %d", response.StatusCode)
	}
	mappings, err := parseAniBridgeMappings(io.LimitReader(response.Body, mappingMaxBytes+1))
	if err != nil {
		return nil, "", false, err
	}
	if err := s.hydrateMissingMALIDs(ctx, mappings); err != nil {
		slog.WarnContext(ctx, "anime_mapping_identity_hydration_failed", "component", "anime", "error", err)
	}
	return mappings, response.Header.Get("ETag"), false, nil
}

func (s *MappingSyncer) hydrateMissingMALIDs(ctx context.Context, mappings []importedMapping) error {
	if s.identityProvider == nil {
		return nil
	}
	ids := make([]int, 0)
	for _, mapping := range mappings {
		if mapping.MALID == nil && mapping.AniListID > 0 {
			ids = append(ids, int(mapping.AniListID))
		}
	}
	if len(ids) == 0 {
		return nil
	}
	resolved, err := s.identityProvider.GetMALIDsByAniListID(ctx, ids)
	if err != nil {
		return fmt.Errorf("resolve %d missing MAL identities through AniList: %w", len(ids), err)
	}
	for index := range mappings {
		malID := resolved[int(mappings[index].AniListID)]
		if mappings[index].MALID == nil && malID > 0 {
			value := int64(malID)
			mappings[index].MALID = &value
			mappings[index].MALVerified = true
			normalizeImportedMappingSegments(&mappings[index])
		}
	}
	return nil
}

func (s *MappingSyncer) markChecked(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `UPDATE anime_mapping_import SET imported_at = CURRENT_TIMESTAMP WHERE singleton = TRUE`)
	if err != nil {
		return fmt.Errorf("mark anime mappings checked: %w", err)
	}
	return nil
}

func (s *MappingSyncer) status(ctx context.Context) (mappingImportStatus, error) {
	var status mappingImportStatus
	err := s.db.QueryRowContext(ctx, `SELECT etag, imported_at FROM anime_mapping_import WHERE singleton = TRUE`).Scan(&status.ETag, &status.ImportedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return status, nil
	}
	if err != nil {
		return status, fmt.Errorf("get anime mapping import status: %w", err)
	}
	status.Exists = true
	return status, nil
}

func (s *MappingSyncer) replace(ctx context.Context, mappings []importedMapping, etag string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin anime mapping import: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	var locked bool
	if err := tx.QueryRowContext(ctx, `SELECT pg_try_advisory_xact_lock(?)`, mappingAdvisoryLock).Scan(&locked); err != nil {
		return fmt.Errorf("lock anime mapping import: %w", err)
	}
	if !locked {
		return nil
	}
	if err := replaceImportedMappingRows(ctx, tx, mappings); err != nil {
		return err
	}
	if err := syncImportedIdentityRegistry(ctx, tx, mappings); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO anime_mapping_import (singleton, source, schema_version, etag, entry_count, imported_at)
		VALUES (TRUE, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT (singleton) DO UPDATE SET source = excluded.source, schema_version = excluded.schema_version,
		etag = excluded.etag, entry_count = excluded.entry_count, imported_at = excluded.imported_at`,
		mappingSource, mappingSchemaVersion, etag, len(mappings))
	if err != nil {
		return fmt.Errorf("save anime mapping import status: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit anime mapping import: %w", err)
	}
	return nil
}

func replaceImportedMappingRows(ctx context.Context, tx *sql.Tx, mappings []importedMapping) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM anime_external_mapping`); err != nil {
		return fmt.Errorf("clear anime mappings: %w", err)
	}
	const batchSize = 500
	for start := 0; start < len(mappings); start += batchSize {
		end := min(start+batchSize, len(mappings))
		if err := insertMappingBatch(ctx, tx, mappings[start:end]); err != nil {
			return err
		}
	}
	return insertMappingSegments(ctx, tx, mappings)
}

func syncImportedIdentityRegistry(ctx context.Context, tx *sql.Tx, mappings []importedMapping) error {
	registry, err := loadIdentityRegistry(ctx, tx)
	if err != nil {
		return err
	}
	for _, mapping := range mappings {
		if err := registry.syncVerifiedMapping(ctx, tx, mapping); err != nil {
			return err
		}
	}
	return nil
}

type loadedIdentityRegistry struct {
	byProvider map[string]map[string]int64
	byIdentity map[int64]map[string]string
}

func loadIdentityRegistry(ctx context.Context, tx *sql.Tx) (*loadedIdentityRegistry, error) {
	registry := &loadedIdentityRegistry{byProvider: map[string]map[string]int64{
		"anilist": {},
		"mal":     {},
	}, byIdentity: map[int64]map[string]string{}}
	rows, err := tx.QueryContext(ctx, `SELECT anime_identity_id, provider, external_id
		FROM anime_external_id WHERE provider IN ('anilist', 'mal')`)
	if err != nil {
		return nil, fmt.Errorf("load anime identity registry: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var identityID int64
		var provider, externalID string
		if err := rows.Scan(&identityID, &provider, &externalID); err != nil {
			return nil, fmt.Errorf("scan anime identity registry: %w", err)
		}
		registry.byProvider[provider][externalID] = identityID
		if registry.byIdentity[identityID] == nil {
			registry.byIdentity[identityID] = map[string]string{}
		}
		registry.byIdentity[identityID][provider] = externalID
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate anime identity registry: %w", err)
	}
	return registry, nil
}

func (registry *loadedIdentityRegistry) syncVerifiedMapping(ctx context.Context, tx *sql.Tx, mapping importedMapping) error {
	if !mapping.MALVerified || mapping.AniListID <= 0 || mapping.MALID == nil || *mapping.MALID <= 0 {
		return nil
	}
	anilistID := strconv.FormatInt(mapping.AniListID, 10)
	malID := strconv.FormatInt(*mapping.MALID, 10)
	identityID, err := registry.resolveIdentity(ctx, tx, anilistID, malID)
	if err != nil {
		return err
	}
	return registry.saveLinks(ctx, tx, identityID, []externalAnimeID{{Provider: "anilist", ExternalID: anilistID}, {Provider: "mal", ExternalID: malID}})
}

func (registry *loadedIdentityRegistry) resolveIdentity(ctx context.Context, tx *sql.Tx, anilistID, malID string) (int64, error) {
	anilistIdentity, hasAniList := registry.byProvider["anilist"][anilistID]
	malIdentity, hasMAL := registry.byProvider["mal"][malID]
	if hasAniList && hasMAL && anilistIdentity != malIdentity {
		if err := mergeAnimeIdentities(ctx, tx, anilistIdentity, []int64{malIdentity}); err != nil {
			return 0, fmt.Errorf("merge imported identity anilist=%s mal=%s: %w", anilistID, malID, err)
		}
		registry.mergeMaps(anilistIdentity, malIdentity)
		return anilistIdentity, nil
	}
	if hasAniList {
		return anilistIdentity, nil
	}
	if hasMAL {
		return malIdentity, nil
	}
	var identityID int64
	if err := tx.QueryRowContext(ctx, `INSERT INTO anime_identity DEFAULT VALUES RETURNING id`).Scan(&identityID); err != nil {
		return 0, fmt.Errorf("create imported anime identity: %w", err)
	}
	registry.byIdentity[identityID] = map[string]string{}
	return identityID, nil
}

func (registry *loadedIdentityRegistry) saveLinks(ctx context.Context, tx *sql.Tx, identityID int64, links []externalAnimeID) error {
	for _, link := range links {
		if existing := registry.byIdentity[identityID][link.Provider]; existing != "" && existing != link.ExternalID {
			return fmt.Errorf("conflicting imported %s identity %q and %q", link.Provider, existing, link.ExternalID)
		}
		if _, exists := registry.byProvider[link.Provider][link.ExternalID]; exists {
			continue
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO anime_external_id (anime_identity_id, provider, external_id)
			VALUES (?, ?, ?)`, identityID, link.Provider, link.ExternalID); err != nil {
			return fmt.Errorf("save imported %s identity: %w", link.Provider, err)
		}
		registry.byProvider[link.Provider][link.ExternalID] = identityID
		registry.byIdentity[identityID][link.Provider] = link.ExternalID
	}
	return nil
}

func (registry *loadedIdentityRegistry) mergeMaps(targetID, duplicateID int64) {
	for provider, externalID := range registry.byIdentity[duplicateID] {
		registry.byProvider[provider][externalID] = targetID
		registry.byIdentity[targetID][provider] = externalID
	}
	delete(registry.byIdentity, duplicateID)
}

func insertMappingBatch(ctx context.Context, tx *sql.Tx, mappings []importedMapping) error {
	var query strings.Builder
	query.WriteString(`INSERT INTO anime_external_mapping (anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season, source) VALUES `)
	args := make([]any, 0, len(mappings)*6)
	for i, mapping := range mappings {
		if i > 0 {
			query.WriteByte(',')
		}
		query.WriteString("(?, ?, ?, ?, ?, ?)")
		args = append(args, mapping.AniListID, mapping.MALID, mapping.MediaType, mapping.TMDBID, mapping.Season, mappingSource)
	}
	if _, err := tx.ExecContext(ctx, query.String(), args...); err != nil {
		return fmt.Errorf("insert anime mapping batch: %w", err)
	}
	return nil
}

func insertMappingSegments(ctx context.Context, tx *sql.Tx, mappings []importedMapping) error {
	const batchSize = 500
	segments := make([]struct {
		AniListID int64
		MediaType string
		TMDBID    int64
		importedMappingSegment
	}, 0)
	for _, mapping := range mappings {
		for _, segment := range mapping.Segments {
			segments = append(segments, struct {
				AniListID int64
				MediaType string
				TMDBID    int64
				importedMappingSegment
			}{mapping.AniListID, mapping.MediaType, mapping.TMDBID, segment})
		}
	}
	for start := 0; start < len(segments); start += batchSize {
		end := min(start+batchSize, len(segments))
		var query strings.Builder
		query.WriteString(`INSERT INTO anime_external_mapping_segment
			(anilist_id, tmdb_media_type, tmdb_id, tmdb_season, source_episode_min, source_episode_max, tmdb_episode_min, tmdb_episode_max) VALUES `)
		args := make([]any, 0, (end-start)*8)
		for index, segment := range segments[start:end] {
			if index > 0 {
				query.WriteByte(',')
			}
			query.WriteString("(?, ?, ?, ?, ?, ?, ?, ?)")
			args = append(args, segment.AniListID, segment.MediaType, segment.TMDBID, segment.Season,
				segment.SourceEpisodeMin, segment.SourceEpisodeMax, segment.TMDBEpisodeMin, segment.TMDBEpisodeMax)
		}
		if _, err := tx.ExecContext(ctx, query.String(), args...); err != nil {
			return fmt.Errorf("insert anime mapping segments: %w", err)
		}
	}
	return nil
}

func parseAniBridgeMappings(reader io.Reader) ([]importedMapping, error) {
	decoder := json.NewDecoder(reader)
	token, err := decoder.Token()
	if err != nil {
		return nil, fmt.Errorf("decode AniBridge mappings: %w", err)
	}
	if delimiter, ok := token.(json.Delim); !ok || delimiter != '{' {
		return nil, errors.New("decode AniBridge mappings: expected JSON object")
	}
	mappings := make([]importedMapping, 0, 12000)
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return nil, fmt.Errorf("decode AniBridge mapping key: %w", err)
		}
		key, _ := keyToken.(string)
		var targets map[string]json.RawMessage
		if err := decoder.Decode(&targets); err != nil {
			return nil, fmt.Errorf("decode AniBridge mapping %q: %w", key, err)
		}
		anilistID, ok := descriptorID(key, "anilist")
		if !ok {
			continue
		}
		if mapping, ok := importedMappingFor(anilistID, targets); ok {
			mappings = append(mappings, mapping)
		}
	}
	if _, err := decoder.Token(); err != nil {
		return nil, fmt.Errorf("finish AniBridge mapping decode: %w", err)
	}
	return mappings, nil
}

func importedMappingFor(anilistID int64, targets map[string]json.RawMessage) (importedMapping, bool) {
	collected := mappingTargets{
		malRanges: make(map[int64][]importedEpisodeRange),
		shows:     make(map[int64][]importedMappingSegment),
		movies:    make(map[int64]struct{}),
	}
	for descriptor, ranges := range targets {
		collected.add(descriptor, ranges)
	}
	malID := collected.unambiguousMALID()
	if len(collected.shows) == 1 {
		for id, segments := range collected.shows {
			segments = deduplicateImportedMappingSegments(segments)
			slices.SortFunc(segments, func(left, right importedMappingSegment) int { return left.Season - right.Season })
			mapping := importedMapping{AniListID: anilistID, MALID: malID, MALRanges: collected.malRanges, MediaType: "tv", TMDBID: id, Season: preferredSeason(segments), Segments: segments}
			if malID != nil {
				normalizeImportedMappingSegments(&mapping)
			}
			return mapping, true
		}
	}
	if len(collected.shows) == 0 && len(collected.movies) == 1 {
		for id := range collected.movies {
			return importedMapping{AniListID: anilistID, MALID: malID, MALRanges: collected.malRanges, MediaType: "movie", TMDBID: id, Season: -1}, true
		}
	}
	return importedMapping{}, false
}

func normalizeImportedMappingSegments(mapping *importedMapping) {
	if mapping == nil || mapping.MALID == nil || len(mapping.MALRanges) == 0 {
		return
	}
	ranges := mapping.MALRanges[*mapping.MALID]
	if len(ranges) == 0 || !hasBoundedImportedEpisodeRange(ranges) {
		return
	}
	normalized := make([]importedMappingSegment, 0, len(mapping.Segments))
	for _, segment := range mapping.Segments {
		for _, episodeRange := range ranges {
			if remapped, ok := remapImportedMappingSegment(segment, episodeRange); ok {
				normalized = append(normalized, remapped)
			}
		}
	}
	if len(normalized) > 0 {
		mapping.Segments = deduplicateImportedMappingSegments(normalized)
		mapping.Season = preferredSeason(mapping.Segments)
	}
}

func hasBoundedImportedEpisodeRange(ranges []importedEpisodeRange) bool {
	for _, episodeRange := range ranges {
		if episodeRange.SourceEpisodeMin > 0 && episodeRange.SourceEpisodeMax > 0 && episodeRange.TargetEpisodeMin > 0 && episodeRange.TargetEpisodeMax > 0 {
			return true
		}
	}
	return false
}

func remapImportedMappingSegment(segment importedMappingSegment, episodeRange importedEpisodeRange) (importedMappingSegment, bool) {
	if segment.SourceEpisodeMin <= 0 || segment.SourceEpisodeMax <= 0 || episodeRange.SourceEpisodeMin <= 0 || episodeRange.SourceEpisodeMax <= 0 {
		return importedMappingSegment{}, false
	}
	segmentSourceMin := segment.SourceEpisodeMin
	overlapMin := max(segmentSourceMin, episodeRange.SourceEpisodeMin)
	overlapMax := min(segment.SourceEpisodeMax, episodeRange.SourceEpisodeMax)
	if overlapMin > overlapMax {
		return importedMappingSegment{}, false
	}
	segment.SourceEpisodeMin = episodeRange.TargetEpisodeMin + overlapMin - episodeRange.SourceEpisodeMin
	segment.SourceEpisodeMax = episodeRange.TargetEpisodeMin + overlapMax - episodeRange.SourceEpisodeMin
	segment.TMDBEpisodeMin += overlapMin - segmentSourceMin
	segment.TMDBEpisodeMax = segment.TMDBEpisodeMin + overlapMax - overlapMin
	return segment, true
}

func deduplicateImportedMappingSegments(segments []importedMappingSegment) []importedMappingSegment {
	if len(segments) < 2 {
		return segments
	}
	selected := make(map[importedSegmentSourceKey]importedMappingSegment, len(segments))
	for _, segment := range segments {
		key := importedSegmentSourceKey{
			SourceEpisodeMin: segment.SourceEpisodeMin,
			SourceEpisodeMax: segment.SourceEpisodeMax,
		}
		current, ok := selected[key]
		if !ok || betterImportedMappingSegment(segment, current) {
			selected[key] = segment
		}
	}
	out := make([]importedMappingSegment, 0, len(selected))
	for _, segment := range selected {
		out = append(out, segment)
	}
	return pruneContainedImportedMappingSegments(out)
}

type importedSegmentSourceKey struct {
	SourceEpisodeMin int
	SourceEpisodeMax int
}

func pruneContainedImportedMappingSegments(segments []importedMappingSegment) []importedMappingSegment {
	if len(segments) < 2 {
		return segments
	}
	out := make([]importedMappingSegment, 0, len(segments))
	for index, segment := range segments {
		contained := false
		for otherIndex, other := range segments {
			if index != otherIndex && importedSegmentSourceContains(other, segment) {
				contained = true
				break
			}
		}
		if !contained {
			out = append(out, segment)
		}
	}
	return out
}

func importedSegmentSourceContains(container importedMappingSegment, segment importedMappingSegment) bool {
	if container.SourceEpisodeMin <= 0 || container.SourceEpisodeMax <= 0 || segment.SourceEpisodeMin <= 0 || segment.SourceEpisodeMax <= 0 {
		return false
	}
	if container.SourceEpisodeMin > segment.SourceEpisodeMin || container.SourceEpisodeMax < segment.SourceEpisodeMax {
		return false
	}
	return container.SourceEpisodeMin < segment.SourceEpisodeMin || container.SourceEpisodeMax > segment.SourceEpisodeMax
}

func betterImportedMappingSegment(candidate importedMappingSegment, current importedMappingSegment) bool {
	candidateAligned := alignedImportedMappingSegment(candidate)
	currentAligned := alignedImportedMappingSegment(current)
	if candidateAligned != currentAligned {
		return candidateAligned
	}
	return candidate.Season > current.Season
}

func alignedImportedMappingSegment(segment importedMappingSegment) bool {
	return segment.SourceEpisodeMin > 0 &&
		segment.SourceEpisodeMax > 0 &&
		segment.SourceEpisodeMin == segment.TMDBEpisodeMin &&
		segment.SourceEpisodeMax == segment.TMDBEpisodeMax
}

type mappingTargets struct {
	malRanges map[int64][]importedEpisodeRange
	shows     map[int64][]importedMappingSegment
	movies    map[int64]struct{}
}

func (m *mappingTargets) add(descriptor string, ranges json.RawMessage) {
	parts := strings.Split(descriptor, ":")
	if len(parts) == 2 {
		m.addUnscoped(parts[0], parts[1], ranges)
		return
	}
	if len(parts) == 3 && parts[0] == "tmdb_show" {
		m.addShow(parts[1], parts[2], ranges)
	}
}

func (m *mappingTargets) addUnscoped(provider, rawID string, ranges json.RawMessage) {
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		return
	}
	switch provider {
	case "mal":
		sourceMin, sourceMax, targetMin, targetMax := mappingEpisodeRanges(ranges)
		m.malRanges[id] = append(m.malRanges[id], importedEpisodeRange{
			SourceEpisodeMin: sourceMin,
			SourceEpisodeMax: sourceMax,
			TargetEpisodeMin: targetMin,
			TargetEpisodeMax: targetMax,
		})
	case "tmdb_movie":
		m.movies[id] = struct{}{}
	}
}

func (m *mappingTargets) unambiguousMALID() *int64 {
	if len(m.malRanges) != 1 {
		return nil
	}
	for id := range m.malRanges {
		return &id
	}
	return nil
}

func (m *mappingTargets) addShow(rawID, scope string, ranges json.RawMessage) {
	id, idErr := strconv.ParseInt(rawID, 10, 64)
	season, seasonErr := strconv.Atoi(strings.TrimPrefix(scope, "s"))
	if idErr != nil || seasonErr != nil || !strings.HasPrefix(scope, "s") || id <= 0 || season < 0 {
		return
	}
	segment := importedMappingSegment{Season: season}
	segment.SourceEpisodeMin, segment.SourceEpisodeMax, segment.TMDBEpisodeMin, segment.TMDBEpisodeMax = mappingEpisodeRanges(ranges)
	m.shows[id] = append(m.shows[id], segment)
}

func preferredSeason(segments []importedMappingSegment) int {
	best := -1
	for _, segment := range segments {
		if segment.Season > 0 && (best <= 0 || segment.Season < best) {
			best = segment.Season
		} else if best < 0 {
			best = segment.Season
		}
	}
	return best
}

func mappingEpisodeRanges(raw json.RawMessage) (int, int, int, int) {
	var ranges map[string]string
	if err := json.Unmarshal(raw, &ranges); err != nil || len(ranges) != 1 {
		return 0, 0, 0, 0
	}
	for source, target := range ranges {
		sourceMin, sourceMax, sourceOK := episodeRange(source)
		tmdbMin, tmdbMax, tmdbOK := episodeRange(target)
		if sourceOK && tmdbOK {
			return sourceMin, sourceMax, tmdbMin, tmdbMax
		}
	}
	return 0, 0, 0, 0
}

func episodeRange(value string) (int, int, bool) {
	parts := strings.Split(strings.TrimSpace(value), "-")
	if len(parts) > 2 || len(parts) == 0 {
		return 0, 0, false
	}
	minimum, err := strconv.Atoi(parts[0])
	if err != nil || minimum <= 0 {
		return 0, 0, false
	}
	maximum := minimum
	if len(parts) == 2 {
		if parts[1] == "" {
			maximum = 0
		} else if maximum, err = strconv.Atoi(parts[1]); err != nil || maximum < minimum {
			return 0, 0, false
		}
	}
	return minimum, maximum, true
}

func descriptorID(descriptor, provider string) (int64, bool) {
	prefix := provider + ":"
	if !strings.HasPrefix(descriptor, prefix) || strings.Contains(strings.TrimPrefix(descriptor, prefix), ":") {
		return 0, false
	}
	id, err := strconv.ParseInt(strings.TrimPrefix(descriptor, prefix), 10, 64)
	return id, err == nil && id > 0
}
