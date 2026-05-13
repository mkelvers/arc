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
	"log"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
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
	httpClient    *http.Client
	proxyTokenKey string
}

type SkipSegment struct {
	Type  string  `json:"type"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

type proxyTokenPayload struct {
	TargetURL string `json:"u"`
	Referer   string `json:"r,omitempty"`
	Scope     string `json:"s"`
	ExpiresAt int64  `json:"exp"`
}

func NewPlaybackService(repo domain.PlaybackRepository, providers []domain.Provider, jikan *jikan.Client, proxyTokenKey string) domain.PlaybackService {
	return &playbackService{repo: repo, providers: providers, jikan: jikan, httpClient: &http.Client{Timeout: 10 * time.Second}, proxyTokenKey: proxyTokenKey}
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
	mac.Write(body)
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
	mac := hmac.New(sha256.New, []byte(s.proxyTokenKey))
	mac.Write(body)
	signature := mac.Sum(nil)
	encodedSig := base64.RawURLEncoding.EncodeToString(signature)
	if encodedSig != parts[1] {
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

func (s *playbackService) BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (map[string]any, error) {
	// 1. Get Anime details for total episodes and titles
	anime, err := s.jikan.GetAnimeByID(ctx, animeID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch anime: %w", err)
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

	type SubtitleItem struct {
		Lang    string `json:"lang"`
		URL     string `json:"url,omitempty"`
		Referer string `json:"referer,omitempty"`
		Token   string `json:"token"`
	}

	type ModeSource struct {
		URL       string         `json:"url,omitempty"`
		Referer   string         `json:"referer,omitempty"`
		Token     string         `json:"token"`
		Subtitles []SubtitleItem `json:"subtitles"`
		Qualities []string       `json:"qualities,omitempty"`
	}

	modeSources := map[string]ModeSource{}
	var result *domain.StreamResult

	for _, m := range []string{"sub", "dub"} {
		for _, p := range s.providers {
			res, err := p.GetStreams(ctx, animeID, searchTitles, episode, m)
			if err != nil || res == nil {
				continue
			}

			var subItems []SubtitleItem
			for _, sub := range res.Subtitles {
				subToken, _ := s.SignProxyToken(sub.URL, res.Referer, "subtitle")
				subItems = append(subItems, SubtitleItem{
					Lang:  sub.Label,
					Token: subToken,
				})
			}

			streamToken, _ := s.SignProxyToken(res.URL, res.Referer, "stream")
			modeSources[m] = ModeSource{
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
		return nil, fmt.Errorf("no streams found")
	}

	if result == nil {
		return nil, fmt.Errorf("no streams found for mode %s", mode)
	}

	// 3. Get start time from progress
	startTime := 0.0
	var watchlistStatus string
	if userID != "" {
		entry, err := s.repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
			UserID:  userID,
			AnimeID: int64(animeID),
		})
		if err == nil {
			watchlistStatus = entry.Status
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

	// 4. Get Episodes list
	jikanEpisodes, err := s.jikan.GetAllEpisodes(ctx, animeID)
	if err != nil {
		log.Printf("failed to fetch episodes from jikan: %v", err)
	}

	// Fallback/Fill episodes if needed
	totalCount := anime.Episodes
	if len(jikanEpisodes) < totalCount {
		epMap := make(map[int]jikan.Episode)
		for _, ep := range jikanEpisodes {
			epMap[ep.MalID] = ep
		}
		for i := 1; i <= totalCount; i++ {
			if _, ok := epMap[i]; !ok {
				jikanEpisodes = append(jikanEpisodes, jikan.Episode{
					MalID:   i,
					Episode: fmt.Sprintf("Episode %d", i),
					Title:   fmt.Sprintf("Episode %d", i),
				})
			}
		}
	}
	sort.Slice(jikanEpisodes, func(i, j int) bool {
		return jikanEpisodes[i].MalID < jikanEpisodes[j].MalID
	})

	domainEpisodes := make([]domain.EpisodeData, len(jikanEpisodes))
	for i, ep := range jikanEpisodes {
		domainEpisodes[i] = domain.EpisodeData{
			MalID:    ep.MalID,
			Title:    ep.Title,
			IsFiller: ep.Filler,
			IsRecap:  ep.Recap,
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
	type SeasonEntry struct {
		MalID     int    `json:"mal_id"`
		Title     string `json:"title"`
		Prefix    string `json:"prefix"`
		IsCurrent bool   `json:"is_current"`
	}
	var seasons []SeasonEntry
	tvCounter := 1
	for _, rel := range relations {
		if strings.ToLower(rel.Anime.Type) == "tv" || strings.ToLower(rel.Anime.Type) == "movie" {
			seasons = append(seasons, SeasonEntry{
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
	segments := s.fetchSkipSegments(ctx, animeID, episode)

	watchData := map[string]any{
		"MalID":            animeID,
		"Title":            anime.DisplayTitle(),
		"CurrentEpisode":   episode,
		"StartTimeSeconds": startTime,
		"Episodes":         domainEpisodes,
		"Providers": []domain.ProviderData{
			{Streams: streams},
		},
		"ModeSources": modeSources,
		"InitialMode": mode,
		"AvailableModes": func() []string {
			var modes []string
			for m := range modeSources {
				modes = append(modes, m)
			}
			sort.Strings(modes)
			return modes
		}(),
		"Segments": segments,
	}

	return map[string]any{
		"WatchData":       watchData,
		"Anime":           anime,
		"Episodes":        domainEpisodes,
		"CurrentEpID":     episode,
		"WatchlistStatus": watchlistStatus,
		"Seasons":         seasons,
	}, nil
}

func (s *playbackService) CompleteAnime(ctx context.Context, userID string, animeID int64) error {
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

func (s *playbackService) SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error {
	_, err := s.repo.UpsertContinueWatchingEntry(ctx, db.UpsertContinueWatchingEntryParams{
		ID:                 uuid.New().String(),
		UserID:             userID,
		AnimeID:            animeID,
		CurrentEpisode:     sql.NullInt64{Int64: int64(episode), Valid: true},
		CurrentTimeSeconds: timeSeconds,
		DurationSeconds:    sql.NullFloat64{Valid: false},
	})
	return err
}

func (s *playbackService) fetchSkipSegments(ctx context.Context, malID int, episode string) []SkipSegment {
	if malID <= 0 || strings.TrimSpace(episode) == "" {
		return []SkipSegment{}
	}

	endpoint := fmt.Sprintf("https://api.aniskip.com/v1/skip-times/%s/%s?types=op&types=ed", url.PathEscape(strconv.Itoa(malID)), url.PathEscape(episode))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return []SkipSegment{}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return []SkipSegment{}
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return []SkipSegment{}
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return []SkipSegment{}
	}

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
	if err := json.Unmarshal(body, &parsed); err != nil {
		return []SkipSegment{}
	}

	if !parsed.Found || len(parsed.Result) == 0 {
		return []SkipSegment{}
	}

	segments := make([]SkipSegment, 0, len(parsed.Result))
	for _, r := range parsed.Result {
		skipType := strings.ToLower(r.SkipType)
		switch skipType {
		case "op":
			skipType = "opening"
		case "ed":
			skipType = "ending"
		}
		segments = append(segments, SkipSegment{
			Type:  skipType,
			Start: r.Interval.StartTime,
			End:   r.Interval.EndTime,
		})
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
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return
	}
	_ = resp.Body.Close()
}
