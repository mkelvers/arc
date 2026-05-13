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
)

type playbackService struct {
	repo           domain.PlaybackRepository
	providers      []domain.Provider
	jikan          *jikan.Client
	httpClient     *http.Client
	proxyTokenKey  string
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

	var result *domain.StreamResult
	for _, p := range s.providers {
		res, err := p.GetStreams(ctx, animeID, searchTitles, episode, mode)
		if err == nil && res != nil {
			result = res
			break
		}
	}

	if result == nil {
		return nil, fmt.Errorf("no streams found")
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
	// AllAnime currently returns one stream in result.URL
	// We wrap it for the template
	streams := []domain.ProviderStream{
		{
			Name:      "Primary",
			URL:       result.URL,
			Quality:   "Auto",
			MalID:     animeID,
			IsCurrent: true,
		},
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

	var subtitleItems []SubtitleItem
	for _, sub := range result.Subtitles {
		subtitleItems = append(subtitleItems, SubtitleItem{
			Lang: sub.Label,
			URL:  sub.URL,
		})
	}

	token, _ := s.SignProxyToken(result.URL, result.Referer, "stream")

	modeSources := map[string]ModeSource{
		mode: {
			URL:       result.URL,
			Referer:   result.Referer,
			Token:     token,
			Subtitles: subtitleItems,
		},
	}

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
		"ModeSources":    modeSources,
		"InitialMode":    mode,
		"AvailableModes": []string{"sub", "dub"},
		"Segments":       segments,
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

func (s *playbackService) SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error {
	params := db.SaveWatchProgressParams{
		UserID:             userID,
		AnimeID:            animeID,
		CurrentEpisode:     sql.NullInt64{Int64: int64(episode), Valid: true},
		CurrentTimeSeconds: timeSeconds,
	}
	return s.repo.SaveWatchProgress(ctx, params)
}

func (s *playbackService) fetchSkipSegments(ctx context.Context, malID int, episode string) []SkipSegment {
	if malID <= 0 || strings.TrimSpace(episode) == "" {
		return nil
	}

	endpoint := fmt.Sprintf("https://api.aniskip.com/v1/skip-times/%s/%s?types=op&types=ed", url.PathEscape(strconv.Itoa(malID)), url.PathEscape(episode))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return nil
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
		return nil
	}

	if !parsed.Found || len(parsed.Result) == 0 {
		return nil
	}

	segments := make([]SkipSegment, 0, len(parsed.Result))
	for _, r := range parsed.Result {
		skipType := strings.ToLower(r.SkipType)
		if skipType == "op" {
			skipType = "opening"
		} else if skipType == "ed" {
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
