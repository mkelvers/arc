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
	repo        domain.WatchlistRepository
	jikan       *jikan.Client
	invalidator domain.RecommendationInvalidator
}

func NewWatchlistService(repo domain.WatchlistRepository, jikan *jikan.Client, invalidator domain.RecommendationInvalidator) domain.WatchlistService {
	return &watchlistService{repo: repo, jikan: jikan, invalidator: invalidator}
}

func (s *watchlistService) UpdateEntry(ctx context.Context, userID string, animeID int64, status string) error {
	anime, fetchedAnime := s.fetchAnimeForWatchlist(ctx, animeID)

	if err := s.repo.InTx(ctx, func(txCtx context.Context, repo domain.WatchlistRepository) error {
		return s.updateEntryInTx(txCtx, repo, userID, animeID, status, anime, fetchedAnime)
	}); err != nil {
		return err
	}
	s.invalidateTopPicks(userID)
	return nil
}

func (s *watchlistService) fetchAnimeForWatchlist(ctx context.Context, animeID int64) (jikan.Anime, bool) {
	if s.jikan == nil {
		return jikan.Anime{}, false
	}
	anime, err := s.jikan.GetAnimeByID(ctx, int(animeID))
	if err != nil {
		// still allow status updates for already-known anime rows
		return jikan.Anime{}, false
	}
	return anime, anime.MalID > 0
}

func (s *watchlistService) updateEntryInTx(ctx context.Context, repo domain.WatchlistRepository, userID string, animeID int64, status string, anime jikan.Anime, fetchedAnime bool) error {
	_, err := repo.GetAnime(ctx, animeID)
	if err != nil && fetchedAnime {
		if _, err := repo.UpsertAnime(ctx, watchlistAnimeParams(anime)); err != nil {
			return err
		}
	}

	existing, err := repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	})
	if err != nil && err != sql.ErrNoRows {
		return err
	}

	_, err = repo.UpsertWatchListEntry(ctx, db.UpsertWatchListEntryParams{
		ID:                 uuid.New().String(),
		UserID:             userID,
		AnimeID:            animeID,
		Status:             status,
		CurrentEpisode:     existing.CurrentEpisode,
		CurrentTimeSeconds: existing.CurrentTimeSeconds,
	})
	return err
}

func watchlistAnimeParams(anime jikan.Anime) db.UpsertAnimeParams {
	durationSeconds := anime.DurationSeconds()
	duration := sql.NullFloat64{Valid: durationSeconds > 0}
	if duration.Valid {
		duration.Float64 = durationSeconds
	}
	return db.UpsertAnimeParams{
		ID:              int64(anime.MalID),
		TitleOriginal:   anime.Title,
		TitleEnglish:    sql.NullString{String: anime.TitleEnglish, Valid: anime.TitleEnglish != ""},
		TitleJapanese:   sql.NullString{String: anime.TitleJapanese, Valid: anime.TitleJapanese != ""},
		ImageUrl:        anime.Images.Webp.LargeImageURL,
		Airing:          sql.NullBool{Bool: anime.Airing, Valid: true},
		DurationSeconds: duration,
	}
}

func (s *watchlistService) RemoveEntry(ctx context.Context, userID string, animeID int64) error {
	if err := s.repo.DeleteWatchListEntry(ctx, db.DeleteWatchListEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	}); err != nil {
		return err
	}
	s.invalidateTopPicks(userID)
	return nil
}

func (s *watchlistService) invalidateTopPicks(userID string) {
	if s.invalidator != nil {
		s.invalidator.InvalidateTopPicksForUser(userID)
	}
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
