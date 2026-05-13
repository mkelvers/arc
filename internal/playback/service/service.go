package service

import (
	"context"
	"fmt"
	"mal/internal/db"
	"mal/internal/domain"
	"strconv"
)

type playbackService struct {
	repo      domain.PlaybackRepository
	providers []domain.Provider
}

func NewPlaybackService(repo domain.PlaybackRepository, providers []domain.Provider) domain.PlaybackService {
	return &playbackService{repo: repo, providers: providers}
}

func (s *playbackService) BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (map[string]any, error) {
	// Minimal implementation for now to show the pattern
	var result *domain.StreamResult
	var err error

	for _, p := range s.providers {
		result, err = p.GetStreams(ctx, animeID, episode, mode)
		if err == nil && result != nil {
			break
		}
	}

	if result == nil {
		return nil, fmt.Errorf("no streams found")
	}

	startTime := 0.0
	if userID != "" {
		entry, err := s.repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
			UserID:  userID,
			AnimeID: int64(animeID),
		})
		if err == nil {
			if entry.CurrentEpisode.Valid && strconv.FormatInt(entry.CurrentEpisode.Int64, 10) == episode {
				startTime = entry.CurrentTimeSeconds
			}
		}
	}

	return map[string]any{
		"URL":        result.URL,
		"Referer":    result.Referer,
		"StartTime":  startTime,
		"Subtitles":  result.Subtitles,
		"Qualities":  result.Qualities,
	}, nil
}

func (s *playbackService) SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error {
	params := db.SaveWatchProgressParams{
		UserID:             userID,
		AnimeID:            animeID,
		CurrentEpisode:     sql.NullInt64{Int64: int64(episode), Valid: true},
		CurrentTimeSeconds: timeSeconds,
	}
	return s.repo.SaveWatchProgress(ctx, params)
}
