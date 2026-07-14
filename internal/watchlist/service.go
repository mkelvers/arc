package watchlist

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"mal/integrations/anilist"
	"mal/internal/database/db"
	"mal/internal/domain"

	"github.com/google/uuid"
)

type animeMetadataProvider interface {
	GetAnimeByID(ctx context.Context, id int) (domain.Anime, error)
}

type watchlistService struct {
	repo          domain.WatchlistRepository
	animeProvider animeMetadataProvider
	invalidator   domain.RecommendationInvalidator
}

func NewWatchlistServiceWithAniList(repo domain.WatchlistRepository, metadata *anilist.CachedClient, invalidator domain.RecommendationInvalidator) domain.WatchlistService {
	return newWatchlistService(repo, metadata, invalidator)
}

func newWatchlistService(repo domain.WatchlistRepository, metadata *anilist.CachedClient, invalidator domain.RecommendationInvalidator) domain.WatchlistService {
	var provider animeMetadataProvider
	if metadata != nil {
		provider = metadataProvider{client: metadata}
	}
	return &watchlistService{repo: repo, animeProvider: provider, invalidator: invalidator}
}

type metadataProvider struct {
	client *anilist.CachedClient
}

func (p metadataProvider) GetAnimeByID(ctx context.Context, id int) (domain.Anime, error) {
	anime, err := p.client.GetAnimeByMALID(ctx, id)
	if err != nil {
		return domain.Anime{}, err
	}
	return anilist.ToMetadataAnime(anime), nil
}

func (s *watchlistService) UpdateEntry(ctx context.Context, userID string, animeID int64, status string) error {
	startedAt := time.Now()
	anime, fetchedAnime, err := s.animeForWatchlist(ctx, animeID)
	if err != nil {
		return err
	}

	if err := s.repo.InTx(ctx, func(txCtx context.Context, repo domain.WatchlistRepository) error {
		return s.updateEntryInTx(txCtx, repo, userID, animeID, status, anime, fetchedAnime)
	}); err != nil {
		return err
	}
	s.invalidateTopPicks(userID)
	s.logUpdate(ctx, userID, animeID, status, fetchedAnime, startedAt)
	return nil
}

func (s *watchlistService) animeForWatchlist(ctx context.Context, animeID int64) (domain.Anime, bool, error) {
	if _, err := s.repo.GetAnime(ctx, animeID); err == nil {
		return domain.Anime{}, false, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return domain.Anime{}, false, fmt.Errorf("get watchlist anime %d: %w", animeID, err)
	}

	if s.animeProvider == nil {
		return domain.Anime{}, false, fmt.Errorf("watchlist anime %d is missing and metadata provider is unavailable", animeID)
	}

	anime, err := s.animeProvider.GetAnimeByID(ctx, int(animeID))
	if err != nil {
		return domain.Anime{}, false, fmt.Errorf("fetch watchlist anime metadata %d: %w", animeID, err)
	}
	if int64(anime.MalID) != animeID {
		return domain.Anime{}, false, fmt.Errorf("fetch watchlist anime metadata %d: returned anime id %d", animeID, anime.MalID)
	}
	return anime, true, nil
}

func (s *watchlistService) updateEntryInTx(ctx context.Context, repo domain.WatchlistRepository, userID string, animeID int64, status string, anime domain.Anime, fetchedAnime bool) error {
	if fetchedAnime {
		if _, err := repo.UpsertAnime(ctx, watchlistAnimeParams(anime)); err != nil {
			return fmt.Errorf("upsert watchlist anime %d: %w", animeID, err)
		}
	}

	existing, err := repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	})
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("get watchlist entry user_id=%s anime_id=%d: %w", userID, animeID, err)
	}

	_, err = repo.UpsertWatchListEntry(ctx, db.UpsertWatchListEntryParams{
		ID:                 uuid.New().String(),
		UserID:             userID,
		AnimeID:            animeID,
		Status:             status,
		CurrentEpisode:     existing.CurrentEpisode,
		CurrentTimeSeconds: existing.CurrentTimeSeconds,
	})
	if err != nil {
		return fmt.Errorf("upsert watchlist entry user_id=%s anime_id=%d: %w", userID, animeID, err)
	}
	return nil
}

func watchlistAnimeParams(anime domain.Anime) db.UpsertAnimeParams {
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
		BannerImageUrl:  anime.BannerImageURL,
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

func (s *watchlistService) logUpdate(ctx context.Context, userID string, animeID int64, status string, fetchedAnime bool, startedAt time.Time) {
	animeSource := "local"
	if fetchedAnime {
		animeSource = "metadata_fetch"
	}
	slog.Log(ctx, slog.LevelInfo, "watchlist_update", "component", "watchlist", "fields", map[string]any{
		"user_id":      userID,
		"anime_id":     animeID,
		"status":       status,
		"anime_source": animeSource,
		"duration_ms":  time.Since(startedAt).Milliseconds(),
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
