package playback

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"mal/internal/db"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/hashicorp/golang-lru/v2"
)

const (
	providerProbeTimeout = 3 * time.Second
)

type Service struct {
	allAnimeClient *allAnimeClient
	httpClient     *http.Client
	sqlDB          *sql.DB
	db             db.Querier
	proxyTokens    *proxyTokenSigner
	proxyHostCache *lru.Cache[string, proxyHostCacheItem]

	cacheMu           sync.RWMutex
	showResolution    *lru.Cache[int, showResolutionCacheItem]
	playbackDataCache *lru.Cache[string, playbackDataCacheItem]
}

type Config struct {
	ProxyTokenSecret string
}

type sourceScore struct {
	source        StreamSource
	total         int
	typeScore     int
	providerScore int
	qualityScore  int
	refererScore  int
}

type showResolutionCacheItem struct {
	ShowID string
	Title  string
}

type playbackDataCacheItem struct {
	Data playbackBaseData
}

type playbackBaseData struct {
	Title            string
	AvailableModes   []string
	ModeSources      map[string]ModeSource
	Segments         []SkipSegment
	FallbackEpisodes map[string]int
}

type modeSourceResult struct {
	Mode   string
	Source ModeSource
	OK     bool
}

type searchModeResult struct {
	Mode    string
	Results []searchResult
	Err     error
}

type directProbeResult struct {
	Playable    bool
	ContentType string
}

type proxyHostCacheItem struct {
	Allowed bool
}

type userPlaybackState struct {
	CurrentStatus    string
	StartTimeSeconds float64
}

func NewService(db db.Querier, sqlDB *sql.DB, cfg Config) (*Service, error) {
	proxyTokens, err := newProxyTokenSigner(cfg.ProxyTokenSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize proxy token signer: %w", err)
	}

	showResolution, err := lru.New[int, showResolutionCacheItem](5000)
	if err != nil {
		return nil, err
	}
	playbackDataCache, err := lru.New[string, playbackDataCacheItem](500)
	if err != nil {
		return nil, err
	}
	proxyHostCache, err := lru.New[string, proxyHostCacheItem](1000)
	if err != nil {
		return nil, err
	}

	return &Service{
		allAnimeClient:    newAllAnimeClient(),
		httpClient:        &http.Client{Timeout: 12 * time.Second},
		sqlDB:             sqlDB,
		db:                db,
		proxyTokens:       proxyTokens,
		proxyHostCache:    proxyHostCache,
		showResolution:    showResolution,
		playbackDataCache: playbackDataCache,
	}, nil
}

func (s *Service) BuildWatchPageData(ctx context.Context, malID int, titleCandidates []string, episode string, mode string, userID string) (WatchPageData, error) {
	if malID <= 0 {
		return WatchPageData{}, errors.New("invalid mal id")
	}

	normalizedMode := normalizeMode(mode)
	if normalizedMode == "" {
		normalizedMode = "dub"
	}

	normalizedEpisode := strings.TrimSpace(episode)
	if normalizedEpisode == "" {
		normalizedEpisode = "1"
	}

	userStateCh := s.fetchUserPlaybackStateAsync(ctx, userID, malID, normalizedEpisode)

	cacheKey := playbackDataCacheKey(malID, normalizedEpisode)
	baseData, cacheHit := s.getPlaybackBaseDataCache(cacheKey)
	if !cacheHit {
		showID, resolvedTitle, err := s.resolveShowCached(ctx, malID, titleCandidates)
		if err != nil {
			return WatchPageData{}, err
		}

		modeSources, segments := s.fetchPlaybackSourcesAndSegments(ctx, showID, malID, normalizedEpisode)
		if len(modeSources) == 0 {
			return WatchPageData{}, errors.New("no direct playable sources available")
		}

		fallbackEpisodes := make(map[string]int)
		if counts, err := s.allAnimeClient.GetAvailableEpisodes(ctx, showID); err == nil {
			fallbackEpisodes["sub"] = len(counts.Sub)
			fallbackEpisodes["dub"] = len(counts.Dub)
			fallbackEpisodes["raw"] = len(counts.Raw)
		}

		watchTitle := strings.TrimSpace(resolvedTitle)
		if watchTitle == "" {
			watchTitle = firstNonEmptyTitle(titleCandidates)
		}
		if watchTitle == "" {
			watchTitle = fmt.Sprintf("MAL #%d", malID)
		}

		baseData = playbackBaseData{
			Title:            watchTitle,
			AvailableModes:   availableModes(modeSources),
			ModeSources:      modeSources,
			Segments:         segments,
			FallbackEpisodes: fallbackEpisodes,
		}

		s.setPlaybackBaseDataCache(cacheKey, baseData)
	}

	initialMode := selectInitialMode(normalizedMode, baseData.ModeSources)

	clientModeSources, err := s.buildClientModeSources(baseData.ModeSources)
	if err != nil {
		return WatchPageData{}, err
	}

	if _, ok := clientModeSources[initialMode]; !ok {
		return WatchPageData{}, errors.New("stream mode unavailable")
	}

	segments := baseData.Segments
	if segments == nil {
		segments = []SkipSegment{}
	}

	userState := userPlaybackState{}
	if userStateCh != nil {
		userState = <-userStateCh
	}

	return WatchPageData{
		MalID:            malID,
		Title:            baseData.Title,
		CurrentEpisode:   normalizedEpisode,
		StartTimeSeconds: userState.StartTimeSeconds,
		CurrentStatus:    userState.CurrentStatus,
		InitialMode:      initialMode,
		AvailableModes:   cloneSlice(baseData.AvailableModes),
		ModeSources:      clientModeSources,
		Segments:         cloneSlice(segments),
		FallbackEpisodes: baseData.FallbackEpisodes,
	}, nil
}

func playbackDataCacheKey(malID int, episode string) string {
	return fmt.Sprintf("%d:%s", malID, episode)
}

func (s *Service) fetchUserPlaybackStateAsync(ctx context.Context, userID string, malID int, episode string) <-chan userPlaybackState {
	if userID == "" || s.db == nil {
		return nil
	}

	resultCh := make(chan userPlaybackState, 1)
	go func() {
		state := userPlaybackState{}

		entry, err := s.db.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
			UserID:  userID,
			AnimeID: int64(malID),
		})
		if err == nil {
			state.CurrentStatus = entry.Status
			if entry.CurrentEpisode.Valid && strconv.FormatInt(entry.CurrentEpisode.Int64, 10) == episode && entry.CurrentTimeSeconds > 0 {
				state.StartTimeSeconds = entry.CurrentTimeSeconds
			}
		}

		if state.StartTimeSeconds <= 0 {
			continueEntry, continueErr := s.db.GetContinueWatchingEntry(ctx, db.GetContinueWatchingEntryParams{
				UserID:  userID,
				AnimeID: int64(malID),
			})
			if continueErr == nil && continueEntry.CurrentEpisode.Valid && strconv.FormatInt(continueEntry.CurrentEpisode.Int64, 10) == episode && continueEntry.CurrentTimeSeconds > 0 {
				state.StartTimeSeconds = continueEntry.CurrentTimeSeconds
			}
		}

		resultCh <- state
	}()

	return resultCh
}

func (s *Service) getPlaybackBaseDataCache(key string) (playbackBaseData, bool) {
	item, ok := s.playbackDataCache.Get(key)
	if !ok {
		return playbackBaseData{}, false
	}
	return clonePlaybackBaseData(item.Data), true
}

func (s *Service) setPlaybackBaseDataCache(key string, data playbackBaseData) {
	s.playbackDataCache.Add(key, playbackDataCacheItem{
		Data: clonePlaybackBaseData(data),
	})
}

func (s *Service) resolveShowCached(ctx context.Context, malID int, titleCandidates []string) (string, string, error) {
	if item, ok := s.showResolution.Get(malID); ok && strings.TrimSpace(item.ShowID) != "" {
		return item.ShowID, item.Title, nil
	}

	showID, resolvedTitle, err := s.resolveShow(ctx, malID, titleCandidates)
	if err != nil {
		return "", "", err
	}

	s.showResolution.Add(malID, showResolutionCacheItem{
		ShowID: showID,
		Title:  resolvedTitle,
	})

	return showID, resolvedTitle, nil
}

func (s *Service) fetchPlaybackSourcesAndSegments(ctx context.Context, showID string, malID int, episode string) (map[string]ModeSource, []SkipSegment) {
	modeCh := make(chan modeSourceResult, 2)
	probeCache := make(map[string]directProbeResult)
	probeCacheMu := sync.Mutex{}

	for _, mode := range []string{"dub", "sub"} {
		modeValue := mode
		go func() {
			resolved, err := s.resolveModeSourceWithCache(ctx, showID, episode, modeValue, "best", probeCache, &probeCacheMu)
			if err != nil {
				log.Printf("playback source resolution failed for mode=%s showID=%s episode=%s: %v", modeValue, showID, episode, err)
				modeCh <- modeSourceResult{Mode: modeValue, OK: false}
				return
			}

			if strings.ToLower(resolved.Type) == "embed" {
				modeCh <- modeSourceResult{Mode: modeValue, OK: false}
				return
			}

			modeCh <- modeSourceResult{
				Mode: modeValue,
				Source: ModeSource{
					URL:       resolved.URL,
					Referer:   resolved.Referer,
					Subtitles: toSubtitleItems(resolved),
					Qualities: toQualities(resolved.AvailableQualities),
				},
				OK: true,
			}
		}()
	}

	segmentsCh := make(chan []SkipSegment, 1)
	go func() {
		segmentsCh <- s.fetchSkipSegments(ctx, malID, episode)
	}()

	modeSources := make(map[string]ModeSource)
	for range 2 {
		result := <-modeCh
		if !result.OK {
			continue
		}
		modeSources[result.Mode] = result.Source
	}

	segments := <-segmentsCh
	return modeSources, segments
}

func clonePlaybackBaseData(data playbackBaseData) playbackBaseData {
	return playbackBaseData{
		Title:            data.Title,
		AvailableModes:   cloneSlice(data.AvailableModes),
		ModeSources:      cloneModeSources(data.ModeSources),
		Segments:         cloneSlice(data.Segments),
		FallbackEpisodes: data.FallbackEpisodes,
	}
}

func (s *Service) GetEpisodeMetadata(ctx context.Context, malID int, episode string) (map[string]any, error) {
	showID, _, err := s.resolveShowCached(ctx, malID, nil)
	if err != nil {
		return nil, err
	}
	return s.allAnimeClient.GetEpisodeMetadata(ctx, showID, episode)
}

func toQualities(sources []StreamSource) []string {
	seen := make(map[string]struct{})
	var qualities []string
	for _, s := range sources {
		q := strings.TrimSpace(s.Quality)
		if q == "" || q == "auto" {
			continue
		}
		if _, ok := seen[q]; !ok {
			seen[q] = struct{}{}
			qualities = append(qualities, q)
		}
	}
	return qualities
}

func cloneSlice[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	if len(items) == 0 {
		return []T{}
	}
	cloned := make([]T, len(items))
	copy(cloned, items)
	return cloned
}

func cloneModeSources(modeSources map[string]ModeSource) map[string]ModeSource {
	if len(modeSources) == 0 {
		return nil
	}
	cloned := make(map[string]ModeSource, len(modeSources))
	for mode, source := range modeSources {
		cloned[mode] = ModeSource{
			URL:       source.URL,
			Referer:   source.Referer,
			Subtitles: cloneSlice(source.Subtitles),
			Qualities: cloneSlice(source.Qualities),
		}
	}
	return cloned
}
