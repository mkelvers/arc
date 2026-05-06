package watchlist

import (
	"context"
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"mal/integrations/jikan"
	"mal/internal/db"
)

type Service struct {
	db          db.Querier
	sqlDB       *sql.DB
	jikanClient *jikan.Client
}

var (
	ErrInvalidAnimeID = errors.New("invalid anime ID")
	ErrInvalidStatus  = errors.New("invalid watchlist status")
)

var validStatuses = map[string]struct{}{
	"watching":      {},
	"completed":     {},
	"dropped":       {},
	"plan_to_watch": {},
	"on_hold":       {},
}

func NewService(db db.Querier, sqlDB *sql.DB, jikanClient *jikan.Client) *Service {
	return &Service{db: db, sqlDB: sqlDB, jikanClient: jikanClient}
}

func (s *Service) ensureAnimeExists(ctx context.Context, animeID int64) error {
	_, err := s.db.GetAnime(ctx, animeID)
	if err == nil {
		return nil
	}

	anime, err := s.jikanClient.GetAnimeByID(ctx, int(animeID))
	if err != nil {
		return fmt.Errorf("failed to fetch anime from jikan: %w", err)
	}

	_, err = s.db.UpsertAnime(ctx, db.UpsertAnimeParams{
		ID:            int64(anime.MalID),
		TitleOriginal: anime.Title,
		TitleEnglish:  sql.NullString{String: anime.TitleEnglish, Valid: anime.TitleEnglish != ""},
		TitleJapanese: sql.NullString{String: anime.TitleJapanese, Valid: anime.TitleJapanese != ""},
		ImageUrl:      anime.Images.Jpg.LargeImageURL,
		Airing:        sql.NullBool{Bool: anime.Airing, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("failed to save anime: %w", err)
	}

	return nil
}

type AddRequest struct {
	AnimeID       int64
	TitleOriginal string
	TitleEnglish  string
	TitleJapanese string
	ImageURL      string
	Status        string
	Airing        bool
}

func (s *Service) AddToWatchlist(ctx context.Context, userID string, animeID int64, status string) error {
	if animeID <= 0 {
		return ErrInvalidAnimeID
	}

	if _, ok := validStatuses[status]; !ok {
		return ErrInvalidStatus
	}

	if err := s.ensureAnimeExists(ctx, animeID); err != nil {
		return err
	}

	entryID := uuid.New().String()
	_, err := s.db.UpsertWatchListEntry(ctx, db.UpsertWatchListEntryParams{
		ID:                 entryID,
		UserID:             userID,
		AnimeID:            animeID,
		Status:             status,
		CurrentEpisode:     sql.NullInt64{Valid: false},
		CurrentTimeSeconds: 0,
	})
	if err != nil {
		return fmt.Errorf("failed to update watchlist: %w", err)
	}

	return nil
}

func (s *Service) RemoveEntry(ctx context.Context, userID string, animeID int64) (db.Anime, error) {
	if animeID <= 0 {
		return db.Anime{}, ErrInvalidAnimeID
	}

	anime, err := s.db.GetAnime(ctx, animeID)
	if err != nil {
		return db.Anime{}, fmt.Errorf("anime not found: %w", err)
	}

	err = s.db.DeleteWatchListEntry(ctx, db.DeleteWatchListEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	})
	if err != nil {
		return db.Anime{}, fmt.Errorf("failed to delete from watchlist: %w", err)
	}

	return anime, nil
}

func (s *Service) GetUserWatchlist(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error) {
	entries, err := s.db.GetUserWatchList(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch watchlist: %w", err)
	}
	return entries, nil
}

func (s *Service) GetContinueWatching(ctx context.Context, userID string) ([]db.GetContinueWatchingEntriesRow, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("invalid user id")
	}

	entries, err := s.db.GetContinueWatchingEntries(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch continue watching: %w", err)
	}

	return entries, nil
}

func (s *Service) DeleteContinueWatching(ctx context.Context, userID string, animeID int64) error {
	if strings.TrimSpace(userID) == "" {
		return errors.New("invalid user id")
	}

	if animeID <= 0 {
		return ErrInvalidAnimeID
	}

	params := db.DeleteContinueWatchingEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	}

	clearProgress := db.SaveWatchProgressParams{
		CurrentEpisode:     sql.NullInt64{Valid: false},
		CurrentTimeSeconds: 0,
		UserID:             userID,
		AnimeID:            animeID,
	}

	if s.sqlDB == nil {
		if err := s.db.DeleteContinueWatchingEntry(ctx, params); err != nil {
			return fmt.Errorf("failed to delete continue watching entry: %w", err)
		}
		return s.db.SaveWatchProgress(ctx, clearProgress)
	}

	txQueries, tx, err := db.BeginTx(ctx, s.sqlDB)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := txQueries.DeleteContinueWatchingEntry(ctx, params); err != nil {
		return fmt.Errorf("failed to delete continue watching entry: %w", err)
	}
	if err := txQueries.SaveWatchProgress(ctx, clearProgress); err != nil {
		return fmt.Errorf("failed to clear watchlist progress: %w", err)
	}

	return tx.Commit()
}

func (s *Service) ImportWatchlist(ctx context.Context, userID string, r io.Reader) error {
	reader := csv.NewReader(r)
	// Read header
	if _, err := reader.Read(); err != nil {
		return fmt.Errorf("failed to read csv header: %w", err)
	}

	records, err := reader.ReadAll()
	if err != nil {
		return fmt.Errorf("failed to read csv records: %w", err)
	}

	for i, record := range records {
		if len(record) < 4 {
			continue // Skip malformed rows
		}

		animeID, err := strconv.ParseInt(record[0], 10, 64)
		if err != nil {
			return fmt.Errorf("row %d: invalid anime id: %w", i+1, err)
		}

		status := record[1]
		if _, ok := validStatuses[status]; !ok {
			status = "plan_to_watch"
		}

		currentEpisode, _ := strconv.ParseInt(record[2], 10, 64)
		currentTimeSeconds, _ := strconv.ParseFloat(record[3], 64)

		if err := s.ensureAnimeExists(ctx, animeID); err != nil {
			return fmt.Errorf("row %d: failed to ensure anime: %w", i+1, err)
		}

		_, err = s.db.UpsertWatchListEntry(ctx, db.UpsertWatchListEntryParams{
			ID:                 uuid.New().String(),
			UserID:             userID,
			AnimeID:            animeID,
			Status:             status,
			CurrentEpisode:     sql.NullInt64{Int64: currentEpisode, Valid: currentEpisode > 0},
			CurrentTimeSeconds: currentTimeSeconds,
		})
		if err != nil {
			return fmt.Errorf("row %d: failed to upsert entry: %w", i+1, err)
		}
	}

	return nil
}
