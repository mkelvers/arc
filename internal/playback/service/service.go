package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
	"mal/pkg/net/limits"
	"mal/pkg/net/useragent"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
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
	auditSvc      domain.AuditService
}

type ProxyTokenKey string

type proxyTokenPayload struct {
	TargetURL string `json:"u"`
	Referer   string `json:"r,omitempty"`
	Scope     string `json:"s"`
	ExpiresAt int64  `json:"exp"`
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
	}
}

func (s *playbackService) SignProxyToken(targetURL, referer, scope string) (string, error) {
	if s.proxyTokenKey == "" {
		return "", nil
	}
	payload := proxyTokenPayload{
		TargetURL: targetURL,
		Referer:   referer,
		Scope:     scope,
		ExpiresAt: time.Now().Add(2 * time.Hour).Unix(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, []byte(s.proxyTokenKey))
	if _, err := mac.Write(body); err != nil {
		return "", fmt.Errorf("sign proxy token: %w", err)
	}
	signature := mac.Sum(nil)
	encodedBody := base64.RawURLEncoding.EncodeToString(body)
	encodedSignature := base64.RawURLEncoding.EncodeToString(signature)
	return encodedBody + "." + encodedSignature, nil
}

func (s *playbackService) VerifyProxyToken(token string) (proxyTokenPayload, error) {
	if s.proxyTokenKey == "" {
		return proxyTokenPayload{}, fmt.Errorf("proxy token key not configured")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return proxyTokenPayload{}, fmt.Errorf("invalid token format")
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return proxyTokenPayload{}, err
	}
	decodedSig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return proxyTokenPayload{}, fmt.Errorf("invalid signature encoding: %w", err)
	}
	mac := hmac.New(sha256.New, []byte(s.proxyTokenKey))
	if _, err := mac.Write(body); err != nil {
		return proxyTokenPayload{}, fmt.Errorf("verify proxy token: %w", err)
	}
	expectedSig := mac.Sum(nil)
	if !hmac.Equal(expectedSig, decodedSig) {
		return proxyTokenPayload{}, fmt.Errorf("invalid signature")
	}
	var payload proxyTokenPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return proxyTokenPayload{}, err
	}
	if payload.ExpiresAt < time.Now().Unix() {
		return proxyTokenPayload{}, fmt.Errorf("token expired")
	}
	return payload, nil
}

func (s *playbackService) ResolveProxyToken(token string) (string, string, error) {
	payload, err := s.VerifyProxyToken(token)
	if err != nil {
		return "", "", err
	}
	return payload.TargetURL, payload.Referer, nil
}

func (s *playbackService) BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (domain.WatchPageData, error) {
	// 1. Get Anime details for total episodes and titles
	anime, err := s.jikan.GetAnimeByID(ctx, animeID)
	if err != nil {
		return domain.WatchPageData{}, fmt.Errorf("failed to fetch anime: %w", err)
	}

	// 2. Resolve streams from providers
	searchTitles := []string{anime.Title}
	if anime.TitleEnglish != "" && anime.TitleEnglish != anime.Title {
		searchTitles = append(searchTitles, anime.TitleEnglish)
	}
	if anime.TitleJapanese != "" {
		searchTitles = append(searchTitles, anime.TitleJapanese)
	}
	for _, syn := range anime.TitleSynonyms {
		if syn != "" && syn != anime.Title && syn != anime.TitleEnglish && syn != anime.TitleJapanese {
			searchTitles = append(searchTitles, syn)
		}
	}

	canonicalEpisodes, err := s.episodes.GetCanonicalEpisodes(ctx, domain.Anime{Anime: anime}, false)
	if err != nil {
		return domain.WatchPageData{}, fmt.Errorf("failed to fetch episodes: %w", err)
	}

	requestedMode := mode
	modeSwitchedFrom := ""
	if epNum, parseErr := strconv.Atoi(episode); parseErr == nil && requestedMode == "dub" {
		for _, ep := range canonicalEpisodes.Episodes {
			if ep.Number == epNum && !ep.HasDub && ep.HasSub {
				mode = "sub"
				modeSwitchedFrom = requestedMode
				break
			}
		}
	}

	modeSources := map[string]domain.ModeSource{}
	var result *domain.StreamResult

	for _, m := range []string{"sub", "dub"} {
		for _, p := range s.providers {
			res, err := p.GetStreams(ctx, animeID, searchTitles, episode, m)
			if err != nil || res == nil {
				continue
			}

			var subItems []domain.SubtitleItem
			for _, sub := range res.Subtitles {
				subToken, _ := s.SignProxyToken(sub.URL, res.Referer, "subtitle")
				subItems = append(subItems, domain.SubtitleItem{
					Lang:  sub.Label,
					Token: subToken,
				})
			}

			streamToken, _ := s.SignProxyToken(res.URL, res.Referer, "stream")
			modeSources[m] = domain.ModeSource{
				URL:       res.URL,
				Referer:   res.Referer,
				Token:     streamToken,
				Subtitles: subItems,
			}

			if m == mode {
				result = res
			}
			break
		}
	}

	if len(modeSources) == 0 {
		return domain.WatchPageData{}, fmt.Errorf("no streams found")
	}

	if result == nil {
		return domain.WatchPageData{}, fmt.Errorf("no streams found for mode %s", mode)
	}

	// 3. Get start time from progress
	startTime := 0.0
	var watchlistStatus string
	var watchlistIDs []int64
	if userID != "" {
		entry, err := s.repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
			UserID:  userID,
			AnimeID: int64(animeID),
		})
		if err == nil {
			watchlistStatus = entry.Status
			watchlistIDs = []int64{entry.AnimeID}
			if entry.CurrentEpisode.Valid && strconv.FormatInt(entry.CurrentEpisode.Int64, 10) == episode {
				startTime = entry.CurrentTimeSeconds
			}
		}

		// Fall back to continue_watching_entry for progress if not in watchlist
		if startTime == 0 {
			cwEntry, err := s.repo.GetContinueWatchingEntry(ctx, db.GetContinueWatchingEntryParams{
				UserID:  userID,
				AnimeID: int64(animeID),
			})
			if err == nil && cwEntry.CurrentEpisode.Valid && strconv.FormatInt(cwEntry.CurrentEpisode.Int64, 10) == episode {
				startTime = cwEntry.CurrentTimeSeconds
			}
		}
	}

	// 5. Build provider data
	streams := []domain.ProviderStream{
		{
			Name:      "Primary",
			URL:       result.URL,
			Quality:   "Auto",
			MalID:     animeID,
			IsCurrent: true,
		},
	}

	go s.warmStreamURL(result.URL, result.Referer)

	// 6. Resolve relations/seasons
	relations, _ := s.jikan.GetFullRelations(ctx, animeID)
	var seasons []domain.SeasonEntry
	tvCounter := 1
	for _, rel := range relations {
		if strings.ToLower(rel.Anime.Type) == "tv" || strings.ToLower(rel.Anime.Type) == "movie" {
			seasons = append(seasons, domain.SeasonEntry{
				MalID:     rel.Anime.MalID,
				Title:     rel.Anime.DisplayTitle(),
				Prefix:    rel.Relation,
				IsCurrent: rel.IsCurrent,
			})
			if rel.Relation == "TV" {
				seasons[len(seasons)-1].Prefix = fmt.Sprintf("S%d", tvCounter)
				tvCounter++
			}
		}
	}

	// Final assembly
	segments := s.fetchSkipSegments(ctx, userID, animeID, episode)

	watchData := domain.WatchData{
		MalID:            animeID,
		Title:            anime.DisplayTitle(),
		CurrentEpisode:   episode,
		StartTimeSeconds: startTime,
		Episodes:         canonicalEpisodes.Episodes,
		Providers: []domain.ProviderData{
			{Streams: streams},
		},
		ModeSources:      modeSources,
		InitialMode:      mode,
		ModeSwitchedFrom: modeSwitchedFrom,
		AvailableModes: func() []string {
			var modes []string
			for m := range modeSources {
				modes = append(modes, m)
			}
			sort.Strings(modes)
			return modes
		}(),
		Segments: segments,
	}

	return domain.WatchPageData{
		WatchData:       watchData,
		Anime:           domain.Anime{Anime: anime},
		Episodes:        canonicalEpisodes.Episodes,
		CurrentEpID:     episode,
		WatchlistStatus: watchlistStatus,
		WatchlistIDs:    watchlistIDs,
		Seasons:         seasons,
	}, nil
}

func (s *playbackService) CompleteAnime(ctx context.Context, userID string, animeID int64) error {
	entry, err := s.repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	})
	if err != nil || entry.Status != "completed" {
		_, err = s.repo.UpsertWatchListEntry(ctx, db.UpsertWatchListEntryParams{
			ID:                 uuid.New().String(),
			UserID:             userID,
			AnimeID:            animeID,
			Status:             "completed",
			CurrentEpisode:     sql.NullInt64{Valid: false},
			CurrentTimeSeconds: 0,
		})
		if err != nil {
			return err
		}
	}

	if err := s.repo.DeleteContinueWatchingEntry(ctx, db.DeleteContinueWatchingEntryParams{
		UserID:  userID,
		AnimeID: animeID,
	}); err != nil {
		return err
	}
	if err := s.repo.SaveWatchProgress(ctx, db.SaveWatchProgressParams{
		UserID:             userID,
		AnimeID:            animeID,
		CurrentEpisode:     sql.NullInt64{Valid: false},
		CurrentTimeSeconds: 0,
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
	return nil
}

func (s *playbackService) UpsertSkipSegmentOverride(ctx context.Context, userID string, animeID int64, episode int, skipType string, startTime, endTime float64) error {
	if userID == "" {
		return fmt.Errorf("not authenticated")
	}
	if animeID <= 0 || episode <= 0 {
		return fmt.Errorf("invalid anime/episode")
	}
	t := strings.ToLower(strings.TrimSpace(skipType))
	switch t {
	case "op", "opening", "intro":
		t = "op"
	case "ed", "ending", "outro":
		t = "ed"
	default:
		return fmt.Errorf("invalid skip_type")
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
		req.Header.Set("User-Agent", useragent.Generic)
		if resp, err := s.httpClient.Do(req); err == nil {
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode == http.StatusOK {
				if body, err := io.ReadAll(io.LimitReader(resp.Body, limits.KiB512)); err == nil {
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
	req.Header.Set("User-Agent", useragent.Firefox121)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return
	}
	_ = resp.Body.Close()
}
