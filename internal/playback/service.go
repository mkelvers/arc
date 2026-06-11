// Package playback manages video playback, including episode sources and subtitle management.
package playback

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
	netutil "mal/pkg/net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
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

type proxyTokenTarget struct {
	targetURL string
	referer   string
	scope     string
	expiresAt time.Time
}

type proxyTokenStore struct {
	mu     sync.Mutex
	tokens map[string]proxyTokenTarget
}

func newProxyTokenStore() *proxyTokenStore {
	return &proxyTokenStore{
		tokens: make(map[string]proxyTokenTarget),
	}
}

func (s *proxyTokenStore) create(targetURL, referer, scope string, ttl time.Duration, now time.Time) (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", fmt.Errorf("generate proxy token: %w", err)
	}

	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneExpiredLocked(now)
	s.tokens[token] = proxyTokenTarget{
		targetURL: targetURL,
		referer:   referer,
		scope:     scope,
		expiresAt: now.Add(ttl),
	}
	return token, nil
}

func (s *proxyTokenStore) resolve(token string, now time.Time) (proxyTokenTarget, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	target, ok := s.tokens[token]
	if !ok {
		return proxyTokenTarget{}, fmt.Errorf("invalid proxy token")
	}
	if !target.expiresAt.After(now) {
		delete(s.tokens, token)
		return proxyTokenTarget{}, fmt.Errorf("proxy token expired")
	}
	return target, nil
}

func (s *proxyTokenStore) pruneExpiredLocked(now time.Time) {
	for token, target := range s.tokens {
		if !target.expiresAt.After(now) {
			delete(s.tokens, token)
		}
	}
}

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

func (s *playbackService) BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (domain.WatchPageData, error) {
	anime, err := s.jikan.GetAnimeByID(ctx, animeID)
	if err != nil {
		return domain.WatchPageData{}, fmt.Errorf("failed to fetch anime: %w", err)
	}

	animeData := domain.Anime{Anime: anime}
	searchTitles := buildSearchTitles(animeData, titleCandidates)
	canonicalEpisodes, err := s.episodes.GetCanonicalEpisodes(ctx, animeData, false)
	if err != nil {
		return domain.WatchPageData{}, fmt.Errorf("failed to fetch episodes: %w", err)
	}

	mode, modeSwitchedFrom := resolveMode(episode, mode, canonicalEpisodes.Episodes)
	modeSources, result := s.resolveModeSources(ctx, animeID, searchTitles, episode, mode)
	if len(modeSources) == 0 {
		return domain.WatchPageData{}, fmt.Errorf("no streams found")
	}
	if result == nil {
		return domain.WatchPageData{}, fmt.Errorf("no streams found for mode %s", mode)
	}

	startTime, watchlistStatus, watchlistIDs := s.loadWatchProgress(ctx, userID, animeID, anime.Episodes, episode)
	go s.warmStreamURL(result.URL, result.Referer)
	seasons := s.loadSeasons(ctx, animeID)
	segments := s.fetchSkipSegments(ctx, userID, animeID, episode)
	watchData := buildWatchDataPayload(animeData, animeID, episode, startTime, canonicalEpisodes.Episodes, modeSources, mode, modeSwitchedFrom, segments)
	return buildWatchPageData(animeData, canonicalEpisodes.Episodes, episode, watchlistStatus, watchlistIDs, seasons, watchData), nil
}

func buildWatchDataPayload(anime domain.Anime, animeID int, episode string, startTime float64, episodes []domain.CanonicalEpisode, modeSources map[string]domain.ModeSource, mode string, modeSwitchedFrom string, segments []domain.SkipSegment) domain.WatchData {
	return domain.WatchData{
		MalID:            animeID,
		Title:            anime.DisplayTitle(),
		CurrentEpisode:   episode,
		StartTimeSeconds: startTime,
		Episodes:         episodes,
		Providers: []domain.ProviderData{{Streams: []domain.ProviderStream{{
			Name:      "Primary",
			Quality:   "Auto",
			MalID:     animeID,
			IsCurrent: true,
		}}}},
		ModeSources:      modeSources,
		InitialMode:      mode,
		ModeSwitchedFrom: modeSwitchedFrom,
		AvailableModes:   availableModes(modeSources),
		Segments:         segments,
		Airing:           anime.Airing,
	}
}

func buildWatchPageData(anime domain.Anime, episodes []domain.CanonicalEpisode, episode string, watchlistStatus string, watchlistIDs []int64, seasons []domain.SeasonEntry, watchData domain.WatchData) domain.WatchPageData {
	return domain.WatchPageData{
		WatchData:       watchData,
		Anime:           anime,
		Episodes:        episodes,
		CurrentEpID:     episode,
		WatchlistStatus: watchlistStatus,
		WatchlistIDs:    watchlistIDs,
		Seasons:         seasons,
	}
}

func buildSearchTitles(anime domain.Anime, titleCandidates []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, 3+len(anime.TitleSynonyms)+len(titleCandidates))

	appendTitle := func(title string) {
		title = strings.TrimSpace(title)
		if title == "" {
			return
		}
		if _, ok := seen[title]; ok {
			return
		}
		seen[title] = struct{}{}
		out = append(out, title)
	}

	appendTitle(anime.Title)
	appendTitle(anime.TitleEnglish)
	appendTitle(anime.TitleJapanese)
	for _, syn := range anime.TitleSynonyms {
		appendTitle(syn)
	}
	for _, candidate := range titleCandidates {
		appendTitle(candidate)
	}

	return out
}

func resolveMode(episode string, requestedMode string, episodes []domain.CanonicalEpisode) (string, string) {
	if requestedMode != "dub" {
		return requestedMode, ""
	}

	epNum, err := strconv.Atoi(episode)
	if err != nil {
		return requestedMode, ""
	}

	for _, ep := range episodes {
		if ep.Number == epNum && !ep.HasDub && ep.HasSub {
			return "sub", requestedMode
		}
	}

	return requestedMode, ""
}

func (s *playbackService) resolveModeSources(ctx context.Context, animeID int, searchTitles []string, episode string, mode string) (map[string]domain.ModeSource, *domain.StreamResult) {
	modeSources := map[string]domain.ModeSource{}
	var result *domain.StreamResult

	for _, currentMode := range []string{"sub", "dub"} {
		res := s.resolveStreamResult(ctx, animeID, searchTitles, episode, currentMode)
		if res == nil {
			continue
		}

		modeSources[currentMode] = s.buildModeSource(res)
		if currentMode == mode {
			result = res
		}
	}

	return modeSources, result
}

func (s *playbackService) resolveStreamResult(ctx context.Context, animeID int, searchTitles []string, episode string, mode string) *domain.StreamResult {
	for _, p := range s.providers {
		res, err := p.GetStreams(ctx, animeID, searchTitles, episode, mode)
		if err == nil && res != nil {
			return res
		}
	}

	return nil
}

func (s *playbackService) buildModeSource(res *domain.StreamResult) domain.ModeSource {
	var subtitles []domain.SubtitleItem
	for _, sub := range res.Subtitles {
		token, _ := s.SignProxyToken(sub.URL, res.Referer, "subtitle")
		subtitles = append(subtitles, domain.SubtitleItem{
			Lang:  sub.Label,
			Token: token,
		})
	}

	streamToken, _ := s.SignProxyToken(res.URL, res.Referer, "stream")
	return domain.ModeSource{
		Token:     streamToken,
		Subtitles: subtitles,
	}
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

func (s *playbackService) loadSeasons(ctx context.Context, animeID int) []domain.SeasonEntry {
	relations, _ := s.jikan.GetFullRelations(ctx, animeID)
	seasons := make([]domain.SeasonEntry, 0, len(relations))
	tvCounter := 1

	for _, rel := range relations {
		animeType := strings.ToLower(rel.Anime.Type)
		if animeType != "tv" && animeType != "movie" {
			continue
		}

		season := domain.SeasonEntry{
			MalID:     rel.Anime.MalID,
			Title:     rel.Anime.DisplayTitle(),
			Prefix:    rel.Relation,
			IsCurrent: rel.IsCurrent,
		}
		if rel.Relation == "TV" {
			season.Prefix = fmt.Sprintf("S%d", tvCounter)
			tvCounter++
		}

		seasons = append(seasons, season)
	}

	return seasons
}

func availableModes(modeSources map[string]domain.ModeSource) []string {
	modes := make([]string, 0, len(modeSources))
	for mode := range modeSources {
		modes = append(modes, mode)
	}
	sort.Strings(modes)
	return modes
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

func normalizeSkipType(skipType string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(skipType)) {
	case "op", "opening", "intro":
		return "op", nil
	case "ed", "ending", "outro":
		return "ed", nil
	default:
		return "", fmt.Errorf("invalid skip_type")
	}
}

func (s *playbackService) UpsertSkipSegmentOverride(ctx context.Context, userID string, animeID int64, episode int, skipType string, startTime, endTime float64) error {
	if userID == "" {
		return fmt.Errorf("not authenticated")
	}
	if animeID <= 0 || episode <= 0 {
		return fmt.Errorf("invalid anime/episode")
	}
	t, err := normalizeSkipType(skipType)
	if err != nil {
		return err
	}
	if !(startTime >= 0) || !(endTime > startTime) {
		return fmt.Errorf("invalid interval")
	}
	// let the player-side filters ignore obviously wrong durations, but keep some sanity.
	if endTime-startTime < 5 || endTime-startTime > 10*60 {
		return fmt.Errorf("interval duration out of range")
	}
	return s.repo.UpsertSkipSegmentOverride(ctx, db.SkipSegmentOverrideRow{
		ID:        uuid.New().String(),
		UserID:    userID,
		AnimeID:   animeID,
		Episode:   int64(episode),
		SkipType:  t,
		StartTime: startTime,
		EndTime:   endTime,
	})
}

func (s *playbackService) fetchSkipSegments(ctx context.Context, userID string, malID int, episode string) []domain.SkipSegment {
	if malID <= 0 || strings.TrimSpace(episode) == "" {
		return []domain.SkipSegment{}
	}

	segments := []domain.SkipSegment{}

	endpoint := fmt.Sprintf("https://api.aniskip.com/v1/skip-times/%s/%s?types=op&types=ed", url.PathEscape(strconv.Itoa(malID)), url.PathEscape(episode))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err == nil {
		req.Header.Set("User-Agent", netutil.Generic)
		if resp, err := s.httpClient.Do(req); err == nil {
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode == http.StatusOK {
				if body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.KiB512)); err == nil {
					type resultItem struct {
						SkipType string `json:"skip_type"`
						Interval struct {
							StartTime float64 `json:"start_time"`
							EndTime   float64 `json:"end_time"`
						} `json:"interval"`
					}
					type apiResponse struct {
						Found  bool         `json:"found"`
						Result []resultItem `json:"results"`
					}

					var parsed apiResponse
					if err := json.Unmarshal(body, &parsed); err == nil && parsed.Found && len(parsed.Result) > 0 {
						segments = make([]domain.SkipSegment, 0, len(parsed.Result))
						for _, r := range parsed.Result {
							skipType := strings.ToLower(r.SkipType)
							switch skipType {
							case "op":
								skipType = "opening"
							case "ed":
								skipType = "ending"
							}
							segments = append(segments, domain.SkipSegment{
								Type:   skipType,
								Start:  r.Interval.StartTime,
								End:    r.Interval.EndTime,
								Source: "aniskip",
							})
						}
					}
				}
			}
		}
	}

	epNum, _ := strconv.ParseInt(strings.TrimSpace(episode), 10, 64)
	if userID != "" && epNum > 0 {
		if ok, err := s.repo.HasSkipSegmentOverrideTable(ctx); err == nil && ok {
			if overrides, err := s.repo.ListSkipSegmentOverrides(ctx, userID, int64(malID), epNum); err == nil {
				// Build map keyed by normalized type ("opening"/"ending")
				overrideByType := make(map[string]domain.SkipSegment, len(overrides))
				for _, o := range overrides {
					t := strings.ToLower(strings.TrimSpace(o.SkipType))
					switch t {
					case "op", "opening", "intro":
						t = "opening"
					case "ed", "ending", "outro":
						t = "ending"
					default:
						continue
					}
					overrideByType[t] = domain.SkipSegment{
						Type:   t,
						Start:  o.StartTime,
						End:    o.EndTime,
						Source: "override",
					}
				}
				if len(overrideByType) > 0 {
					merged := make([]domain.SkipSegment, 0, len(segments)+len(overrideByType))
					seen := map[string]bool{}
					for _, seg := range segments {
						if o, ok := overrideByType[seg.Type]; ok {
							merged = append(merged, o)
							seen[seg.Type] = true
						} else {
							merged = append(merged, seg)
							seen[seg.Type] = true
						}
					}
					for t, o := range overrideByType {
						if !seen[t] {
							merged = append(merged, o)
						}
					}
					segments = merged
				}
			}
		}
	}

	return segments
}

func (s *playbackService) warmStreamURL(targetURL, referer string) {
	req, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		return
	}
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	req.Header.Set("User-Agent", netutil.Firefox121)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return
	}
	_ = resp.Body.Close()
}
