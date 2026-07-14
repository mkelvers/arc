package anime

import (
	"context"
	"fmt"
	"mal/integrations/tmdb"
)

const (
	mediaSelectionBackdrop = "backdrop"
	mediaSelectionLogo     = "logo"
)

type mediaSelection struct {
	Kind     string
	MediaRef tmdb.MediaRef
	FilePath string
}

func (s *MappingStore) SaveMediaSelection(ctx context.Context, animeID int, kind string, ref tmdb.MediaRef, filePath string) error {
	if animeID <= 0 {
		return fmt.Errorf("save media selection: invalid anime id %d", animeID)
	}
	if !validMediaSelectionKind(kind) {
		return fmt.Errorf("save media selection: invalid kind %q", kind)
	}
	if err := validateMediaSelectionRef(ref); err != nil {
		return fmt.Errorf("save media selection: %w", err)
	}
	if filePath == "" {
		return fmt.Errorf("save media selection: file path is empty")
	}

	_, err := s.db.ExecContext(ctx, `INSERT INTO anime_media_selection
		(anime_id, kind, tmdb_media_type, tmdb_id, file_path, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT (anime_id, kind) DO UPDATE SET
			tmdb_media_type = excluded.tmdb_media_type,
			tmdb_id = excluded.tmdb_id,
			file_path = excluded.file_path,
			updated_at = excluded.updated_at`,
		animeID, kind, ref.Type, ref.ID, filePath)
	if err != nil {
		return fmt.Errorf("save media selection anime_id=%d kind=%s: %w", animeID, kind, err)
	}
	return nil
}

func (s *MappingStore) DeleteMediaSelection(ctx context.Context, animeID int, kind string) error {
	if animeID <= 0 {
		return fmt.Errorf("delete media selection: invalid anime id %d", animeID)
	}
	if !validMediaSelectionKind(kind) {
		return fmt.Errorf("delete media selection: invalid kind %q", kind)
	}

	_, err := s.db.ExecContext(ctx, `DELETE FROM anime_media_selection
		WHERE anime_id = ? AND kind = ?`, animeID, kind)
	if err != nil {
		return fmt.Errorf("delete media selection anime_id=%d kind=%s: %w", animeID, kind, err)
	}
	return nil
}

func (s *MappingStore) MediaSelections(ctx context.Context, animeID int) (map[string]mediaSelection, error) {
	if animeID <= 0 {
		return nil, fmt.Errorf("load media selections: invalid anime id %d", animeID)
	}

	rows, err := s.db.QueryContext(ctx, `SELECT kind, tmdb_media_type, tmdb_id, file_path
		FROM anime_media_selection
		WHERE anime_id = ?`, animeID)
	if err != nil {
		return nil, fmt.Errorf("query media selections anime_id=%d: %w", animeID, err)
	}
	defer rows.Close()

	selections := make(map[string]mediaSelection)
	for rows.Next() {
		var selection mediaSelection
		var mediaType string
		if err := rows.Scan(&selection.Kind, &mediaType, &selection.MediaRef.ID, &selection.FilePath); err != nil {
			return nil, fmt.Errorf("scan media selection anime_id=%d: %w", animeID, err)
		}
		selection.MediaRef.Type = tmdb.MediaType(mediaType)
		selections[selection.Kind] = selection
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate media selections anime_id=%d: %w", animeID, err)
	}
	return selections, nil
}

func validMediaSelectionKind(kind string) bool {
	return kind == mediaSelectionBackdrop || kind == mediaSelectionLogo
}

func validateMediaSelectionRef(ref tmdb.MediaRef) error {
	if ref.ID <= 0 {
		return fmt.Errorf("invalid TMDB id %d", ref.ID)
	}
	if ref.Type != tmdb.MediaTypeTV && ref.Type != tmdb.MediaTypeMovie {
		return fmt.Errorf("invalid TMDB media type %q", ref.Type)
	}
	return nil
}
