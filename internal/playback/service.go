// Package playback manages video playback, including episode sources and subtitle management.
package playback

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
	netutil "mal/pkg/net"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
)

type playbackService struct {
	repo          domain.PlaybackRepository
	providers     []domain.Provider
	jikan         *jikan.Client
	episodes      domain.EpisodeService
	httpClient    *http.Client
	proxyTokenKey string
	proxyTokens   *proxyTokenStore
	auditSvc      domain.AuditService
}

type ProxyTokenKey string

func NewPlaybackService(repo domain.PlaybackRepository, providers []domain.Provider, jikan *jikan.Client, episodes domain.EpisodeService, auditSvc domain.AuditService, proxyTokenKey ProxyTokenKey) domain.PlaybackService {
	return &playbackService{
		repo:          repo,
		providers:     providers,
		jikan:         jikan,
		episodes:      episodes,
		auditSvc:      auditSvc,
		httpClient:    &http.Client{Timeout: 10 * time.Second},
		proxyTokenKey: string(proxyTokenKey),
		proxyTokens:   newProxyTokenStore(),
	}
}

func (s *playbackService) SignProxyToken(targetURL, referer, scope string) (string, error) {
	if s.proxyTokenKey == "" {
		return "", nil
	}
	return s.proxyTokens.create(targetURL, referer, scope, 2*time.Hour, time.Now())
}

func (s *playbackService) ResolveProxyToken(token string, scope string) (string, string, error) {
	if s.proxyTokenKey == "" {
		return "", "", fmt.Errorf("proxy token key not configured")
	}
	target, err := s.proxyTokens.resolve(token, time.Now())
	if err != nil {
		return "", "", err
	}
	if target.scope != scope {
		return "", "", fmt.Errorf("invalid proxy token scope")
	}
	return target.targetURL, target.referer, nil
}

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
	_, err := s.repo.UpsertContinueWatchingEntry(ctx, db.UpsertContinueWatchingEntryParams{
		ID:                 uuid.New().String(),
		UserID:             userID,
		AnimeID:            animeID,
		CurrentEpisode:     sql.NullInt64{Int64: int64(episode), Valid: true},
		CurrentTimeSeconds: timeSeconds,
		DurationSeconds:    sql.NullFloat64{Valid: false},
	})
	if err != nil {
		return err
	}

	metadataBytes, marshalErr := json.Marshal(struct {
		Episode     int     `json:"episode"`
		TimeSeconds float64 `json:"time_seconds"`
	}{Episode: episode, TimeSeconds: timeSeconds})
	if marshalErr == nil {
		_ = s.auditSvc.Record(ctx, domain.AuditEvent{
			UserID:       userID,
			Action:       "watch_progress_saved",
			ResourceType: "anime",
			ResourceID:   strconv.FormatInt(animeID, 10),
			MetadataJSON: metadataBytes,
		})
	} else {
		_ = s.auditSvc.Record(ctx, domain.AuditEvent{
			UserID:       userID,
			Action:       "watch_progress_saved",
			ResourceType: "anime",
			ResourceID:   strconv.FormatInt(animeID, 10),
		})
	}
	observability.Info("watch_progress_saved", "playback", "", map[string]any{
		"anime_id":     animeID,
		"episode":      episode,
		"time_seconds": timeSeconds,
		"user_id":      userID,
	})
	return nil
}

func (s *playbackService) warmStreamURL(targetURL, referer string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return
	}
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	req.Header.Set("User-Agent", netutil.Firefox121)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return
	}
	_ = resp.Body.Close()
}
