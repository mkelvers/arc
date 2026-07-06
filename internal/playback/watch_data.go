package playback

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"mal/integrations/jikan"
	"mal/internal/domain"
	"mal/internal/observability"
)

const sourceResolutionTimeout = 15 * time.Second

type sourceResolutionResult struct {
	result    *domain.StreamResult
	err       error
	duration  time.Duration
	shared    bool
	completed bool
}

const episodeAvailabilityUncertainWarning = "Episode availability may be incomplete or out of date. Continue only if you understand that the episode list and audio availability may be uncertain."

func (s *playbackService) BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (domain.WatchPageData, error) {
	animeData, err := s.watchAnime(ctx, animeID)
	if err != nil {
		return domain.WatchPageData{}, fmt.Errorf("failed to fetch anime: %w", err)
	}

	if err := s.ensureAnimeRow(ctx, animeData); err != nil {
		observability.Warn("upsert_anime_failed", "playback", "",
			map[string]any{"anime_id": animeID},
			err,
		)
	}
	anime := animeData.Anime
	searchTitles := buildSearchTitles(animeData, titleCandidates)
	eps, err := s.episodes.GetCanonicalEpisodes(ctx, animeData, false)
	if err != nil {
		return domain.WatchPageData{}, fmt.Errorf("failed to fetch episodes: %w", err)
	}

	// mode fallback
	mode, from := resolveMode(episode, mode, eps.Episodes)
	deferred := domain.PlaybackDataDeferred(ctx)
	modeSources, result, mode, from := s.watchModeSources(
		ctx, animeID, searchTitles, episode, mode, from, !anime.Airing, deferred,
	)
	startTime, watchlistStatus, watchlistIDs := s.loadWatchProgress(ctx, userID, animeID, anime.Episodes, episode)
	segments := s.watchSegments(ctx, userID, animeID, episode, deferred)
	watchData := buildWatchDataPayload(animeData, animeID, episode, startTime, eps.Episodes, modeSources, mode, from, segments)
	pageData := buildWatchPageData(animeData, eps.Episodes, episode, watchlistStatus, watchlistIDs, nil, watchData)
	pageData.EpisodeAvailabilityWarning = episodeAvailabilityWarning(eps, time.Now())
	if deferred {
		return pageData, nil
	}
	if len(modeSources) == 0 {
		return pageData, fmt.Errorf("no streams found")
	}
	if result == nil {
		return pageData, fmt.Errorf("no streams found for mode %s", mode)
	}

	return pageData, nil
}

func (s *playbackService) EnrichEpisodeTitles(ctx context.Context, animeID int) ([]domain.CanonicalEpisode, error) {
	anime, err := s.watchAnime(ctx, animeID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch anime for episode titles: %w", err)
	}
	enricher, ok := s.episodes.(domain.EpisodeTitleService)
	if !ok {
		return nil, errors.New("episode title enrichment is unavailable")
	}
	episodes, err := enricher.EnrichEpisodeTitles(ctx, anime)
	if err != nil {
		return nil, err
	}
	return episodes.Episodes, nil
}

func (s *playbackService) watchAnime(ctx context.Context, animeID int) (domain.Anime, error) {
	row, err := s.repo.GetAnime(ctx, int64(animeID))
	if err == nil && row.ID > 0 && strings.TrimSpace(row.TitleOriginal) != "" {
		anime := jikan.Anime{
			MalID:         int(row.ID),
			Title:         row.TitleOriginal,
			TitleEnglish:  row.TitleEnglish.String,
			TitleJapanese: row.TitleJapanese.String,
			Airing:        row.Airing.Valid && row.Airing.Bool,
			Status:        row.Status.String,
		}
		return domain.Anime{Anime: anime}, nil
	}

	anime, err := s.jikan.GetAnimeByID(ctx, animeID)
	if err != nil {
		return domain.Anime{}, err
	}
	return domain.Anime{Anime: anime}, nil
}

func (s *playbackService) watchModeSources(ctx context.Context, animeID int, searchTitles []string, episode, mode, from string, allowStale, deferred bool) (map[string]domain.ModeSource, *domain.StreamResult, string, string) {
	if deferred {
		return map[string]domain.ModeSource{}, nil, mode, from
	}

	modeSources, result, resolvedMode, switchedFrom := s.resolveModeSources(
		ctx,
		animeID,
		searchTitles,
		episode,
		mode,
		allowStale,
		domain.PlaybackSourceRefreshRequested(ctx),
	)
	if resolvedMode != "" {
		mode = resolvedMode
	}
	if switchedFrom != "" {
		from = switchedFrom
	}
	return modeSources, result, mode, from
}

func (s *playbackService) watchSegments(ctx context.Context, userID string, animeID int, episode string, deferred bool) []domain.SkipSegment {
	if deferred {
		return []domain.SkipSegment{}
	}
	segments, err := s.fetchSkipSegments(ctx, userID, animeID, episode)
	if err != nil {
		observability.Warn("fetch_skip_segments_failed", "playback", "",
			map[string]any{"anime_id": animeID, "episode": episode},
			err,
		)
	}
	return segments
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

func episodeAvailabilityWarning(episodeList domain.CanonicalEpisodeList, now time.Time) string {
	if episodeList.FailureCount > 0 {
		return episodeAvailabilityUncertainWarning
	}
	if episodeList.NextRefreshAt == "" {
		return ""
	}
	nextRefresh, err := time.Parse(time.RFC3339, episodeList.NextRefreshAt)
	if err != nil {
		return ""
	}
	if nextRefresh.After(now) {
		return ""
	}
	return episodeAvailabilityUncertainWarning
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

func (s *playbackService) resolveModeSources(ctx context.Context, animeID int, searchTitles []string, episode string, requestedMode string, allowStale bool, forceRefresh bool) (map[string]domain.ModeSource, *domain.StreamResult, string, string) {
	requestedMode = normalizeSourceMode(requestedMode)
	if res := s.resolveStreamResult(ctx, animeID, searchTitles, episode, requestedMode, allowStale, forceRefresh); res != nil {
		return map[string]domain.ModeSource{
			requestedMode: s.buildModeSource(res),
		}, res, requestedMode, ""
	}

	for _, fallbackMode := range fallbackModes(requestedMode) {
		res := s.resolveStreamResult(ctx, animeID, searchTitles, episode, fallbackMode, allowStale, forceRefresh)
		if res == nil {
			continue
		}
		return map[string]domain.ModeSource{
			fallbackMode: s.buildModeSource(res),
		}, res, fallbackMode, requestedMode
	}

	return map[string]domain.ModeSource{}, nil, requestedMode, ""
}

func (s *playbackService) resolveStreamResult(ctx context.Context, animeID int, searchTitles []string, episode string, mode string, allowStale bool, forceRefresh bool) *domain.StreamResult {
	key := newSourceCacheKey(animeID, episode, mode)
	stale, state := s.sourceCache.get(key, time.Now())
	if !forceRefresh && state == sourceCacheFresh {
		observability.Info("playback_source_cache_hit", "playback", "", map[string]any{"anime_id": animeID, "episode": episode, "mode": key.mode})
		return stale
	}

	observability.Info("playback_source_cache_miss", "playback", "", map[string]any{"anime_id": animeID, "episode": episode, "mode": key.mode, "forced": forceRefresh})
	resolved := s.waitForSourceResult(ctx, key, animeID, searchTitles, forceRefresh)
	if !resolved.completed {
		return nil
	}
	observability.Info("playback_source_resolution", "playback", "", map[string]any{
		"anime_id": animeID, "episode": episode, "mode": key.mode,
		"duration_ms": resolved.duration.Milliseconds(), "shared": resolved.shared,
	})
	if resolved.err == nil {
		return cloneStreamResult(resolved.result)
	}
	if allowStale && state == sourceCacheStale && stale != nil {
		observability.Warn("playback_source_cache_stale_hit", "playback", "", map[string]any{"anime_id": animeID, "episode": episode, "mode": key.mode}, errors.New("provider source refresh failed"))
		return stale
	}
	observability.Warn("playback_source_resolution_failed", "playback", "", map[string]any{"anime_id": animeID, "episode": episode, "mode": key.mode}, errors.New("provider source resolution failed"))
	return nil
}

func (s *playbackService) waitForSourceResult(ctx context.Context, key sourceCacheKey, animeID int, searchTitles []string, forceRefresh bool) sourceResolutionResult {
	startedAt := time.Now()
	resultCh := s.sourceFlight.DoChan(key.flightKey(), func() (any, error) {
		return s.resolveSource(key, animeID, searchTitles, forceRefresh)
	})
	select {
	case <-ctx.Done():
		return sourceResolutionResult{err: ctx.Err(), duration: time.Since(startedAt)}
	case resolved := <-resultCh:
		result, _ := resolved.Val.(*domain.StreamResult)
		return sourceResolutionResult{
			result: result, err: resolved.Err, shared: resolved.Shared,
			duration: time.Since(startedAt), completed: true,
		}
	}
}

func (s *playbackService) resolveSource(key sourceCacheKey, animeID int, searchTitles []string, forceRefresh bool) (*domain.StreamResult, error) {
	if !forceRefresh {
		if cached, state := s.sourceCache.get(key, time.Now()); state == sourceCacheFresh {
			return cached, nil
		}
	}
	resolveCtx, cancel := context.WithTimeout(context.Background(), sourceResolutionTimeout)
	defer cancel()

	var lastErr error
	for _, provider := range s.providers {
		result, err := provider.GetStreams(resolveCtx, animeID, searchTitles, key.episode, key.mode)
		if err == nil && result != nil {
			if s.sourceCache.set(key, result, time.Now()) {
				observability.Info("playback_source_cache_eviction", "playback", "", nil)
			}
			return cloneStreamResult(result), nil
		}
		if err != nil {
			lastErr = err
		}
	}
	if lastErr == nil {
		lastErr = errors.New("no provider returned a stream")
	}
	return nil, lastErr
}

func (s *playbackService) buildModeSource(res *domain.StreamResult) domain.ModeSource {
	subtitles := make([]domain.SubtitleItem, 0, len(res.Subtitles))
	for _, sub := range res.Subtitles {
		token, err := s.SignProxyToken(sub.URL, res.Referer, "subtitle")
		if err != nil {
			observability.Warn("sign_subtitle_token_failed", "playback", "", nil, err)
		}
		subtitles = append(subtitles, domain.SubtitleItem{
			Lang:  sub.Label,
			Token: token,
		})
	}

	streamToken, err := s.SignProxyToken(res.URL, res.Referer, "stream")
	if err != nil {
		observability.Warn("sign_stream_token_failed", "playback", "", nil, err)
	}
	return domain.ModeSource{
		Token:     streamToken,
		Type:      res.Type,
		Subtitles: subtitles,
	}
}

func availableModes(modeSources map[string]domain.ModeSource) []string {
	modes := make([]string, 0, len(modeSources))
	for mode := range modeSources {
		modes = append(modes, mode)
	}
	sort.Strings(modes)
	return modes
}

func fallbackModes(requestedMode string) []string {
	switch requestedMode {
	case "sub":
		return []string{"dub"}
	case "dub":
		return []string{"sub"}
	default:
		return []string{"sub", "dub"}
	}
}
