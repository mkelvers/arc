package playback

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strconv"

	"mal/integrations/tmdb"

	"github.com/google/uuid"

	"mal/internal/database/db"
	"mal/internal/domain"
)

type progressTarget struct {
	AnimeID int64
	Episode int
	Offset  int
}

func (s *playbackService) loadWatchProgress(ctx context.Context, userID string, animeID int, totalEpisodes int, episode string) (float64, string, []int64) {
	if userID == "" {
		return 0, "", nil
	}

	target := s.resolveProgressTarget(ctx, int64(animeID), 0)
	entry, err := s.repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
		UserID:  userID,
		AnimeID: target.AnimeID,
	})

	watchlistStatus := ""
	var watchlistIDs []int64
	startTime := 0.0
	if err == nil {
		watchlistStatus = entry.Status
		watchlistIDs = []int64{entry.AnimeID}
		if resumeTimeForEpisode(progressEpisodeForAnime(entry.CurrentEpisode, target.Offset), entry.CurrentTimeSeconds, totalEpisodes, episode) > 0 {
			startTime = entry.CurrentTimeSeconds
		}
	}

	if startTime > 0 {
		return startTime, watchlistStatus, watchlistIDs
	}

	cwEntry, err := s.repo.GetContinueWatchingEntry(ctx, db.GetContinueWatchingEntryParams{
		UserID:  userID,
		AnimeID: target.AnimeID,
	})
	if err == nil {
		startTime = resumeTimeForEpisode(progressEpisodeForAnime(cwEntry.CurrentEpisode, target.Offset), cwEntry.CurrentTimeSeconds, totalEpisodes, episode)
	}

	return startTime, watchlistStatus, watchlistIDs
}

func progressEpisodeForAnime(currentEpisode sql.NullInt64, offset int) sql.NullInt64 {
	if !currentEpisode.Valid || offset <= 0 {
		return currentEpisode
	}
	episode := currentEpisode.Int64 - int64(offset)
	if episode <= 0 {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: episode, Valid: true}
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

func (s *playbackService) CompleteAnime(ctx context.Context, userID string, animeID int64, episode int) (domain.WatchCompletion, error) {
	if next, ok := s.nextMappedEpisode(ctx, animeID, episode); ok {
		if err := s.saveNextEpisodeProgress(ctx, userID, next); err != nil {
			return domain.WatchCompletion{}, err
		}
		target := s.resolveProgressTarget(ctx, next.AnimeID, next.Episode)
		return domain.WatchCompletion{NextURL: fmt.Sprintf("/anime/%d/watch?ep=%d", target.AnimeID, target.Episode)}, nil
	}

	target := s.resolveProgressTarget(ctx, animeID, episode)
	if err := s.repo.InTx(ctx, func(txCtx context.Context, repo domain.PlaybackRepository) error {
		entry, err := repo.GetWatchListEntry(txCtx, db.GetWatchListEntryParams{
			UserID:  userID,
			AnimeID: target.AnimeID,
		})
		if err != nil || entry.Status != "completed" {
			_, err = repo.UpsertWatchListEntry(txCtx, db.UpsertWatchListEntryParams{
				ID:                 uuid.New().String(),
				UserID:             userID,
				AnimeID:            target.AnimeID,
				Status:             "completed",
				CurrentEpisode:     entry.CurrentEpisode,
				CurrentTimeSeconds: entry.CurrentTimeSeconds,
			})
			if err != nil {
				return fmt.Errorf("upsert completed watchlist entry user_id=%s anime_id=%d: %w", userID, target.AnimeID, err)
			}
		}

		if err := repo.DeleteContinueWatchingEntry(txCtx, db.DeleteContinueWatchingEntryParams{
			UserID:  userID,
			AnimeID: target.AnimeID,
		}); err != nil {
			return fmt.Errorf("delete completed continue watching entry user_id=%s anime_id=%d: %w", userID, target.AnimeID, err)
		}

		return nil
	}); err != nil {
		return domain.WatchCompletion{}, fmt.Errorf("complete anime transaction user_id=%s anime_id=%d: %w", userID, target.AnimeID, err)
	}

	return domain.WatchCompletion{Completed: true}, nil
}

type mappedEpisode struct {
	AnimeID int64
	Episode int
}

func (s *playbackService) nextMappedEpisode(ctx context.Context, animeID int64, episode int) (mappedEpisode, bool) {
	if episode <= 0 {
		return mappedEpisode{}, false
	}
	current := s.resolveProgressTarget(ctx, animeID, episode)
	return s.mappedEpisodeForGlobal(ctx, animeID, current.Episode+1)
}

func (s *playbackService) mappedEpisodeForGlobal(ctx context.Context, animeID int64, globalEpisode int) (mappedEpisode, bool) {
	mapping, err := s.repo.GetAnimeMappingByMALID(ctx, animeID)
	if err != nil || !stackableProgressMapping(mapping) {
		return mappedEpisode{}, false
	}
	mappings, err := s.repo.GetAnimeMappingsForGroup(ctx, mapping.MediaType, mapping.TMDBID)
	if err != nil {
		slog.Warn("watch_completion_group_mappings_failed", "component", "playback", "fields", map[string]any{
			"tmdb_media_type": mapping.MediaType,
			"tmdb_id":         mapping.TMDBID,
		}, "error", err)
		return mappedEpisode{}, false
	}

	remaining := globalEpisode
	seen := map[int64]struct{}{}
	for _, candidate := range mappings {
		if !stackableProgressMapping(candidate) {
			continue
		}
		if _, ok := seen[candidate.MALID]; ok {
			continue
		}
		seen[candidate.MALID] = struct{}{}
		count := s.playbackEpisodeCount(ctx, candidate.MALID)
		if count <= 0 {
			continue
		}
		if remaining <= count {
			return mappedEpisode{AnimeID: candidate.MALID, Episode: remaining}, true
		}
		remaining -= count
	}
	return mappedEpisode{}, false
}

func (s *playbackService) saveNextEpisodeProgress(ctx context.Context, userID string, next mappedEpisode) error {
	target := s.resolveProgressTarget(ctx, next.AnimeID, next.Episode)
	err := s.repo.InTx(ctx, func(txCtx context.Context, repo domain.PlaybackRepository) error {
		if _, err := repo.GetAnime(txCtx, target.AnimeID); errors.Is(err, sql.ErrNoRows) {
			if _, err := repo.UpsertAnime(txCtx, minimalAnimeParams(target.AnimeID)); err != nil {
				return fmt.Errorf("upsert minimal anime %d: %w", target.AnimeID, err)
			}
		} else if err != nil {
			return fmt.Errorf("get anime %d: %w", target.AnimeID, err)
		}

		_, err := repo.UpsertContinueWatchingEntry(txCtx, db.UpsertContinueWatchingEntryParams{
			ID:                 uuid.New().String(),
			UserID:             userID,
			AnimeID:            target.AnimeID,
			CurrentEpisode:     sql.NullInt64{Int64: int64(target.Episode), Valid: true},
			CurrentTimeSeconds: 0,
			DurationSeconds:    sql.NullFloat64{Valid: false},
		})
		if err != nil {
			return fmt.Errorf("upsert next continue watching entry user_id=%s anime_id=%d episode=%d: %w", userID, target.AnimeID, target.Episode, err)
		}
		if target.AnimeID != next.AnimeID {
			if err := repo.DeleteContinueWatchingEntry(txCtx, db.DeleteContinueWatchingEntryParams{
				UserID:  userID,
				AnimeID: next.AnimeID,
			}); err != nil {
				return fmt.Errorf("delete duplicate next continue watching entry user_id=%s anime_id=%d: %w", userID, next.AnimeID, err)
			}
		}
		return repo.SaveWatchProgress(txCtx, db.SaveWatchProgressParams{
			UserID:             userID,
			AnimeID:            target.AnimeID,
			CurrentEpisode:     sql.NullInt64{Int64: int64(target.Episode), Valid: true},
			CurrentTimeSeconds: 0,
		})
	})
	if err != nil {
		return fmt.Errorf("save next episode progress user_id=%s anime_id=%d episode=%d: %w", userID, target.AnimeID, target.Episode, err)
	}
	return nil
}

func (s *playbackService) SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error {
	target := s.resolveProgressTarget(ctx, animeID, episode)
	err := s.repo.InTx(ctx, func(txCtx context.Context, repo domain.PlaybackRepository) error {
		if _, err := repo.GetAnime(txCtx, target.AnimeID); errors.Is(err, sql.ErrNoRows) {
			if _, err := repo.UpsertAnime(txCtx, minimalAnimeParams(target.AnimeID)); err != nil {
				return fmt.Errorf("upsert minimal anime %d: %w", target.AnimeID, err)
			}
		} else if err != nil {
			return fmt.Errorf("get anime %d: %w", target.AnimeID, err)
		}

		_, err := repo.UpsertContinueWatchingEntry(txCtx, db.UpsertContinueWatchingEntryParams{
			ID:                 uuid.New().String(),
			UserID:             userID,
			AnimeID:            target.AnimeID,
			CurrentEpisode:     sql.NullInt64{Int64: int64(target.Episode), Valid: true},
			CurrentTimeSeconds: timeSeconds,
			DurationSeconds:    sql.NullFloat64{Valid: false},
		})
		if err != nil {
			return fmt.Errorf("upsert continue watching entry user_id=%s anime_id=%d episode=%d: %w", userID, target.AnimeID, target.Episode, err)
		}
		if target.AnimeID != animeID {
			if err := repo.DeleteContinueWatchingEntry(txCtx, db.DeleteContinueWatchingEntryParams{
				UserID:  userID,
				AnimeID: animeID,
			}); err != nil {
				return fmt.Errorf("delete duplicate continue watching entry user_id=%s anime_id=%d: %w", userID, animeID, err)
			}
		}
		if err := repo.SaveWatchProgress(txCtx, db.SaveWatchProgressParams{
			UserID:             userID,
			AnimeID:            target.AnimeID,
			CurrentEpisode:     sql.NullInt64{Int64: int64(target.Episode), Valid: true},
			CurrentTimeSeconds: timeSeconds,
		}); err != nil {
			return fmt.Errorf("save watchlist progress user_id=%s anime_id=%d episode=%d: %w", userID, target.AnimeID, target.Episode, err)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("save progress transaction user_id=%s anime_id=%d episode=%d: %w", userID, target.AnimeID, target.Episode, err)
	}
	slog.Info("watch_progress_saved", "component", "playback", "fields", map[string]any{
		"anime_id":     target.AnimeID,
		"episode":      target.Episode,
		"source_id":    animeID,
		"source_ep":    episode,
		"time_seconds": timeSeconds,
		"user_id":      userID,
	})
	return nil
}

func (s *playbackService) resolveProgressTarget(ctx context.Context, animeID int64, episode int) progressTarget {
	target := progressTarget{AnimeID: animeID, Episode: episode}
	mapping, err := s.repo.GetAnimeMappingByMALID(ctx, animeID)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			slog.Warn("watch_progress_mapping_failed", "component", "playback", "fields", map[string]any{"anime_id": animeID}, "error", err)
		}
		return target
	}
	if !stackableProgressMapping(mapping) {
		return target
	}

	canonical, err := s.repo.GetCanonicalAnimeMapping(ctx, mapping.MediaType, mapping.TMDBID)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			slog.Warn("watch_progress_canonical_mapping_failed", "component", "playback", "fields", map[string]any{
				"anime_id":        animeID,
				"tmdb_media_type": mapping.MediaType,
				"tmdb_id":         mapping.TMDBID,
			}, "error", err)
		}
		return target
	}
	if canonical.MALID <= 0 {
		return target
	}

	offset := s.progressEpisodeOffset(ctx, mapping)
	target.AnimeID = canonical.MALID
	target.Offset = offset
	if episode > 0 {
		target.Episode = offset + episode
	}
	return target
}

func (s *playbackService) progressEpisodeOffset(ctx context.Context, current domain.AnimeMediaMapping) int {
	if s.episodes == nil {
		return 0
	}
	mappings, err := s.repo.GetAnimeMappingsForGroup(ctx, current.MediaType, current.TMDBID)
	if err != nil {
		slog.Warn("watch_progress_group_mappings_failed", "component", "playback", "fields", map[string]any{
			"tmdb_media_type": current.MediaType,
			"tmdb_id":         current.TMDBID,
		}, "error", err)
		return 0
	}

	offset := 0
	seen := map[int64]struct{}{}
	for _, mapping := range mappings {
		if !stackableProgressMapping(mapping) {
			continue
		}
		if mapping.MALID == current.MALID {
			return offset
		}
		if mapping.Season > current.Season {
			return offset
		}
		if mapping.Season < current.Season || mapping.Season == current.Season {
			if _, ok := seen[mapping.MALID]; ok {
				continue
			}
			seen[mapping.MALID] = struct{}{}
			offset += s.playbackEpisodeCount(ctx, mapping.MALID)
		}
	}
	return offset
}

func stackableProgressMapping(mapping domain.AnimeMediaMapping) bool {
	return mapping.MediaType == "tv" && mapping.TMDBID > 0 && mapping.MALID > 0 && mapping.Season > 0
}

func (s *playbackService) playbackEpisodeCount(ctx context.Context, animeID int64) int {
	anime, err := s.watchAnime(ctx, int(animeID))
	if err != nil {
		return 0
	}
	episodes, err := s.episodes.GetCanonicalEpisodes(ctx, anime, false)
	if err != nil {
		slog.Warn("watch_progress_episode_count_failed", "component", "playback", "fields", map[string]any{"anime_id": animeID}, "error", err)
		return 0
	}
	count := domain.RegularEpisodeCount(episodes.Episodes)
	mapping, err := s.repo.GetAnimeMappingByMALID(ctx, animeID)
	if !tmdbEpisodeCountReady(err, s.tmdbClient, mapping) {
		return count
	}
	if segmentCount, ok := s.mappingSegmentEpisodeCount(ctx, mapping, count); ok {
		return segmentCount
	}
	season, err := s.tmdbClient.GetSeasonMetadata(ctx, mapping.TMDBID, mapping.Season, "en-US")
	if err != nil || len(season.Episodes) <= 0 {
		return count
	}
	return min(count, len(season.Episodes))
}

func tmdbEpisodeCountReady(err error, client *tmdb.Client, mapping domain.AnimeMediaMapping) bool {
	return err == nil && client != nil && mapping.MediaType == string(tmdb.MediaTypeTV) && mapping.TMDBID > 0 && mapping.Season > 0
}

func (s *playbackService) mappingSegmentEpisodeCount(ctx context.Context, mapping domain.AnimeMediaMapping, available int) (int, bool) {
	segments, err := s.repo.GetAnimeMappingSegments(ctx, mapping)
	if err != nil || len(segments) == 0 {
		return 0, false
	}
	highest := 0
	for _, segment := range segments {
		highest = max(highest, segment.SourceEpisodeMax)
	}
	if highest <= 0 {
		return available, true
	}
	return min(available, highest), true
}

func (s *playbackService) ensureAnimeRow(ctx context.Context, anime domain.Anime) error {
	existing, err := s.repo.GetAnime(ctx, int64(anime.MalID))
	if err == nil && (existing.BannerImageUrl != "" || anime.BannerImageURL == "") {
		return nil
	}
	_, err = s.repo.UpsertAnime(ctx, animeParams(anime))
	if err != nil {
		return fmt.Errorf("upsert anime %d: %w", anime.MalID, err)
	}
	return nil
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
		ImageUrl:        anime.Images.Webp.LargeImageURL,
		BannerImageUrl:  anime.BannerImageURL,
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
