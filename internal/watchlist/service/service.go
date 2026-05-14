package service

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
	_, err := s.repo.GetAnime(ctx, animeID)
	if err != nil {
		anime, err := s.jikan.GetAnimeByID(ctx, int(animeID))
		if err == nil {
			_, _ = s.repo.UpsertAnime(ctx, db.UpsertAnimeParams{
				ID:            int64(anime.MalID),
				TitleOriginal: anime.Title,
				TitleEnglish:  sql.NullString{String: anime.TitleEnglish, Valid: anime.TitleEnglish != ""},
				TitleJapanese: sql.NullString{String: anime.TitleJapanese, Valid: anime.TitleJapanese != ""},
				ImageUrl:      anime.ImageURL(),
				Airing:        sql.NullBool{Bool: anime.Airing, Valid: true},
			})
		}
	}

	_, err = s.repo.UpsertWatchListEntry(ctx, db.UpsertWatchListEntryParams{
		ID:      uuid.New().String(),
		UserID:  userID,
		AnimeID: animeID,
		Status:  status,
	})
	return err
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
	_ = s.repo.DeleteContinueWatchingEntry(ctx, db.DeleteContinueWatchingEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	})
	return s.repo.SaveWatchProgress(ctx, db.SaveWatchProgressParams{
		UserID:             userID,
		AnimeID:            animeID,
		CurrentEpisode:     sql.NullInt64{Valid: false},
		CurrentTimeSeconds: 0,
	})
}
