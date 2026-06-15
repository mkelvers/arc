package playback

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/google/uuid"

	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
)

func (s *playbackService) loadWatchProgress(ctx context.Context, userID string, animeID int, totalEpisodes int, episode string) (float64, string, []int64) {
	if userID == "" {
		return 0, "", nil
	}

	entry, err := s.repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
		UserID:  userID,
		AnimeID: int64(animeID),
	})

	watchlistStatus := ""
	var watchlistIDs []int64
	startTime := 0.0
	if err == nil {
		watchlistStatus = entry.Status
		watchlistIDs = []int64{entry.AnimeID}
		if resumeTimeForEpisode(entry.CurrentEpisode, entry.CurrentTimeSeconds, totalEpisodes, episode) > 0 {
			startTime = entry.CurrentTimeSeconds
		}
	}

	if startTime > 0 {
		return startTime, watchlistStatus, watchlistIDs
	}

	cwEntry, err := s.repo.GetContinueWatchingEntry(ctx, db.GetContinueWatchingEntryParams{
		UserID:  userID,
		AnimeID: int64(animeID),
	})
	if err == nil {
		startTime = resumeTimeForEpisode(cwEntry.CurrentEpisode, cwEntry.CurrentTimeSeconds, totalEpisodes, episode)
	}

	return startTime, watchlistStatus, watchlistIDs
}

func resumeTimeForEpisode(currentEpisode sql.NullInt64, currentTimeSeconds float64, totalEpisodes int, requestedEpisode string) float64 {
	if !currentEpisode.Valid {
		return 0
	}

	if strconv.FormatInt(currentEpisode.Int64, 10) == requestedEpisode {
		return currentTimeSeconds
	}

	if totalEpisodes > 0 && requestedEpisode == strconv.Itoa(totalEpisodes) && currentEpisode.Int64 == int64(totalEpisodes) {
		return currentTimeSeconds
	}

	return 0
}

func (s *playbackService) CompleteAnime(ctx context.Context, userID string, animeID int64) error {
	if err := s.repo.InTx(ctx, func(txCtx context.Context, repo domain.PlaybackRepository) error {
		entry, err := repo.GetWatchListEntry(txCtx, db.GetWatchListEntryParams{
			UserID:  userID,
			AnimeID: animeID,
		})
		if err != nil || entry.Status != "completed" {
			_, err = repo.UpsertWatchListEntry(txCtx, db.UpsertWatchListEntryParams{
				ID:                 uuid.New().String(),
				UserID:             userID,
				AnimeID:            animeID,
				Status:             "completed",
				CurrentEpisode:     entry.CurrentEpisode,
				CurrentTimeSeconds: entry.CurrentTimeSeconds,
			})
			if err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return err
	}

	if err := s.auditSvc.Record(ctx, domain.AuditEvent{
		UserID:       userID,
		Action:       "watch_completed",
		ResourceType: "anime",
		ResourceID:   strconv.FormatInt(animeID, 10),
	}); err != nil {
		observability.Warn(
			"audit_record_failed",
			"playback",
			"",
			map[string]any{"user_id": userID, "anime_id": animeID, "action": "watch_completed"},
			err,
		)
	}
	return nil
}

func (s *playbackService) SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error {
	err := s.repo.InTx(ctx, func(txCtx context.Context, repo domain.PlaybackRepository) error {
		if _, err := repo.GetAnime(txCtx, animeID); err != nil {
			if _, err := repo.UpsertAnime(txCtx, minimalAnimeParams(animeID)); err != nil {
				return err
			}
		}

		_, err := repo.UpsertContinueWatchingEntry(txCtx, db.UpsertContinueWatchingEntryParams{
			ID:                 uuid.New().String(),
			UserID:             userID,
			AnimeID:            animeID,
			CurrentEpisode:     sql.NullInt64{Int64: int64(episode), Valid: true},
			CurrentTimeSeconds: timeSeconds,
			DurationSeconds:    sql.NullFloat64{Valid: false},
		})
		return err
	})
	if err != nil {
		return err
	}

	event := domain.AuditEvent{
		UserID:       userID,
		Action:       "watch_progress_saved",
		ResourceType: "anime",
		ResourceID:   strconv.FormatInt(animeID, 10),
	}
	metadataBytes, marshalErr := json.Marshal(struct {
		Episode     int     `json:"episode"`
		TimeSeconds float64 `json:"time_seconds"`
	}{Episode: episode, TimeSeconds: timeSeconds})
	if marshalErr == nil {
		event.MetadataJSON = metadataBytes
	}
	if err := s.auditSvc.Record(ctx, event); err != nil {
		observability.Warn(
			"audit_record_failed",
			"playback",
			"",
			map[string]any{"user_id": userID, "anime_id": animeID, "action": "watch_progress_saved"},
			err,
		)
	}
	observability.Info("watch_progress_saved", "playback", "", map[string]any{
		"anime_id":     animeID,
		"episode":      episode,
		"time_seconds": timeSeconds,
		"user_id":      userID,
	})
	return nil
}

func (s *playbackService) ensureAnimeRow(ctx context.Context, anime domain.Anime) error {
	if _, err := s.repo.GetAnime(ctx, int64(anime.MalID)); err == nil {
		return nil
	}
	_, err := s.repo.UpsertAnime(ctx, animeParams(anime))
	return err
}

func animeParams(anime domain.Anime) db.UpsertAnimeParams {
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
		ImageUrl:        anime.ImageURL(),
		Airing:          sql.NullBool{Bool: anime.Airing, Valid: true},
		DurationSeconds: duration,
	}
}

func minimalAnimeParams(animeID int64) db.UpsertAnimeParams {
	return db.UpsertAnimeParams{
		ID:            animeID,
		TitleOriginal: fmt.Sprintf("Anime %d", animeID),
		Airing:        sql.NullBool{Valid: false},
	}
}
