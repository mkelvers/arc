package watchlist

import (
	"context"
	"database/sql"

	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"

	"github.com/google/uuid"
)

type watchlistService struct {
	repo  domain.WatchlistRepository
	jikan *jikan.Client
}

func NewWatchlistService(repo domain.WatchlistRepository, jikan *jikan.Client) domain.WatchlistService {
	return &watchlistService{repo: repo, jikan: jikan}
}

func (s *watchlistService) UpdateEntry(ctx context.Context, userID string, animeID int64, status string) error {
	anime, fetchErr := s.jikan.GetAnimeByID(ctx, int(animeID))
	if fetchErr != nil {
		// still allow status updates for already-known anime rows
		anime = jikan.Anime{}
	}

	return s.repo.InTx(ctx, func(txCtx context.Context, repo domain.WatchlistRepository) error {
		_, err := repo.GetAnime(txCtx, animeID)
		if err != nil && fetchErr == nil {
			durationSeconds := anime.DurationSeconds()
			duration := sql.NullFloat64{Valid: durationSeconds > 0}
			if duration.Valid {
				duration.Float64 = durationSeconds
			}
			if _, err := repo.UpsertAnime(txCtx, db.UpsertAnimeParams{
				ID:              int64(anime.MalID),
				TitleOriginal:   anime.Title,
				TitleEnglish:    sql.NullString{String: anime.TitleEnglish, Valid: anime.TitleEnglish != ""},
				TitleJapanese:   sql.NullString{String: anime.TitleJapanese, Valid: anime.TitleJapanese != ""},
				ImageUrl:        anime.ImageURL(),
				Airing:          sql.NullBool{Bool: anime.Airing, Valid: true},
				DurationSeconds: duration,
			}); err != nil {
				return err
			}
		}

		existing, err := repo.GetWatchListEntry(txCtx, db.GetWatchListEntryParams{
			UserID:  userID,
			AnimeID: animeID,
		})
		if err != nil && err != sql.ErrNoRows {
			return err
		}

		_, err = repo.UpsertWatchListEntry(txCtx, db.UpsertWatchListEntryParams{
			ID:                 uuid.New().String(),
			UserID:             userID,
			AnimeID:            animeID,
			Status:             status,
			CurrentEpisode:     existing.CurrentEpisode,
			CurrentTimeSeconds: existing.CurrentTimeSeconds,
		})
		return err
	})
}

func (s *watchlistService) RemoveEntry(ctx context.Context, userID string, animeID int64) error {
	return s.repo.DeleteWatchListEntry(ctx, db.DeleteWatchListEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	})
}

func (s *watchlistService) GetWatchlist(ctx context.Context, userID string) ([]domain.UserWatchListRow, error) {
	return s.repo.GetUserWatchList(ctx, userID)
}

func (s *watchlistService) GetWatchlistMap(ctx context.Context, userID string, animeIDs []int64) (map[int64]bool, error) {
	watchlistMap := make(map[int64]bool)
	if userID == "" || len(animeIDs) == 0 {
		return watchlistMap, nil
	}

	matches, err := s.repo.GetUserWatchlistAnimeIDs(ctx, userID, animeIDs)
	if err != nil {
		return watchlistMap, err
	}

	for _, animeID := range matches {
		watchlistMap[animeID] = true
	}

	return watchlistMap, nil
}

func (s *watchlistService) GetCommandPaletteWatchlist(ctx context.Context, userID string, query string, limit int64) ([]domain.UserWatchListRow, error) {
	return s.repo.GetCommandPaletteWatchlist(ctx, userID, query, limit)
}

func (s *watchlistService) GetCommandPaletteContinueWatching(ctx context.Context, userID string, query string, limit int64) ([]db.GetContinueWatchingEntriesRow, error) {
	return s.repo.GetCommandPaletteContinueWatching(ctx, userID, query, limit)
}

func (s *watchlistService) GetWatchListEntry(ctx context.Context, userID string, animeID int64) (db.WatchListEntry, error) {
	return s.repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	})
}

func (s *watchlistService) GetContinueWatchingEntry(ctx context.Context, userID string, animeID int64) (db.ContinueWatchingEntry, error) {
	return s.repo.GetContinueWatchingEntry(ctx, db.GetContinueWatchingEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	})
}

func (s *watchlistService) DeleteContinueWatching(ctx context.Context, userID string, animeID int64) error {
	return s.repo.InTx(ctx, func(txCtx context.Context, repo domain.WatchlistRepository) error {
		if err := repo.DeleteContinueWatchingEntry(txCtx, db.DeleteContinueWatchingEntryParams{
			UserID:  userID,
			AnimeID: animeID,
		}); err != nil {
			return err
		}
		return repo.SaveWatchProgress(txCtx, db.SaveWatchProgressParams{
			UserID:             userID,
			AnimeID:            animeID,
			CurrentEpisode:     sql.NullInt64{Valid: false},
			CurrentTimeSeconds: 0,
		})
	})
}
