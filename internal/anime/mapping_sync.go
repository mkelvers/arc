package anime

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
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
	AniListID int64
	MALID     *int64
	MediaType string
	TMDBID    int64
	Season    int
}

type mappingImportStatus struct {
	ETag       string
	ImportedAt time.Time
	Exists     bool
}

type MappingSyncer struct {
	db         *sql.DB
	httpClient *http.Client
	sourceURL  string
	now        func() time.Time
	mu         sync.Mutex
}

func NewMappingSyncer(db *sql.DB) *MappingSyncer {
	return &MappingSyncer{
		db:         db,
		httpClient: &http.Client{Timeout: 2 * time.Minute},
		sourceURL:  aniBridgeMappingsURL,
		now:        time.Now,
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
	return mappings, response.Header.Get("ETag"), false, nil
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
	collected := mappingTargets{shows: make(map[int64][]int), movies: make(map[int64]struct{})}
	for descriptor := range targets {
		collected.add(descriptor)
	}
	if len(collected.shows) == 1 {
		for id, seasons := range collected.shows {
			return importedMapping{AniListID: anilistID, MALID: collected.malID, MediaType: "tv", TMDBID: id, Season: preferredSeason(seasons)}, true
		}
	}
	if len(collected.shows) == 0 && len(collected.movies) == 1 {
		for id := range collected.movies {
			return importedMapping{AniListID: anilistID, MALID: collected.malID, MediaType: "movie", TMDBID: id, Season: -1}, true
		}
	}
	return importedMapping{}, false
}

type mappingTargets struct {
	malID  *int64
	shows  map[int64][]int
	movies map[int64]struct{}
}

func (m *mappingTargets) add(descriptor string) {
	parts := strings.Split(descriptor, ":")
	if len(parts) == 2 {
		m.addUnscoped(parts[0], parts[1])
		return
	}
	if len(parts) == 3 && parts[0] == "tmdb_show" {
		m.addShow(parts[1], parts[2])
	}
}

func (m *mappingTargets) addUnscoped(provider, rawID string) {
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		return
	}
	switch provider {
	case "mal":
		m.malID = &id
	case "tmdb_movie":
		m.movies[id] = struct{}{}
	}
}

func (m *mappingTargets) addShow(rawID, scope string) {
	id, idErr := strconv.ParseInt(rawID, 10, 64)
	season, seasonErr := strconv.Atoi(strings.TrimPrefix(scope, "s"))
	if idErr != nil || seasonErr != nil || !strings.HasPrefix(scope, "s") || id <= 0 || season < 0 {
		return
	}
	m.shows[id] = append(m.shows[id], season)
}

func preferredSeason(seasons []int) int {
	best := -1
	for _, season := range seasons {
		if season > 0 && (best <= 0 || season < best) {
			best = season
		} else if best < 0 {
			best = season
		}
	}
	return best
}

func descriptorID(descriptor, provider string) (int64, bool) {
	prefix := provider + ":"
	if !strings.HasPrefix(descriptor, prefix) || strings.Contains(strings.TrimPrefix(descriptor, prefix), ":") {
		return 0, false
	}
	id, err := strconv.ParseInt(strings.TrimPrefix(descriptor, prefix), 10, 64)
	return id, err == nil && id > 0
}
