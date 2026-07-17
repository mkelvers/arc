package playback

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"mal/integrations/tmdb"
	"mal/internal/domain"
	"maps"
	"sort"
	"strings"
	"sync"
	"time"

	"mal/integrations/anilist"
)

const sourceResolutionTimeout = 15 * time.Second

type sourceResolutionResult struct {
	result    *domain.StreamResult
	err       error
	duration  time.Duration
	shared    bool
	completed bool
}

type watchModeResult struct {
	sources map[string]domain.ModeSource
	stream  *domain.StreamResult
	mode    string
	from    string
}

type watchProgressResult struct {
	startTime       float64
	watchlistStatus string
	watchlistIDs    []int64
}

const episodeAvailabilityUncertainWarning = "Episode availability may be incomplete or out of date. Continue only if you understand that the episode list and audio availability may be uncertain."

func (s *playbackService) BuildWatchData(ctx context.Context, request domain.WatchDataRequest) (data domain.WatchPageData, err error) {
	animeID, titleCandidates, episode, mode, userID := request.AnimeID, request.TitleCandidates, request.Episode, request.Mode, request.UserID
	totalStartedAt := time.Now()
	defer func() {
		logWatchDataStage("total", animeID, episode, totalStartedAt, map[string]any{"failed": err != nil})
	}()

	loaded, err := s.loadWatchAnimeEpisodes(ctx, animeID, episode, titleCandidates, "")
	if err != nil {
		return domain.WatchPageData{}, err
	}
	displayEpisodes := s.watchDisplayEpisodes(ctx, loaded, episode)

	// mode fallback
	mode, from := resolveMode(episode, mode, loaded.episodes.Episodes)
	deferred := domain.PlaybackDataDeferred(ctx)
	branches := watchBranchInput{ctx: ctx, animeID: animeID, searchTitles: loaded.searchTitles, episode: episode, mode: mode, from: from, userID: userID, totalEpisodes: loaded.anime.Episodes, allowStale: !loaded.anime.Airing, deferred: deferred}
	modeResult, progress, segments := s.loadWatchBranches(branches)
	watchData := buildWatchDataPayload(watchDataPayloadInput{anime: loaded.anime, animeID: animeID, episode: episode, startTime: progress.startTime, episodes: displayEpisodes.Episodes, modeSources: modeResult.sources, mode: modeResult.mode, modeSwitchedFrom: modeResult.from, segments: segments})
	pageData := buildWatchPageData(watchPageDataInput{anime: loaded.anime, animeID: animeID, episodes: displayEpisodes.Episodes, episode: episode, watchlistStatus: progress.watchlistStatus, watchlistIDs: progress.watchlistIDs, watchData: watchData})
	pageData.EpisodeAvailabilityWarning = episodeAvailabilityWarning(loaded.episodes, time.Now())
	if deferred {
		return pageData, nil
	}
	if len(modeResult.sources) == 0 {
		return pageData, fmt.Errorf("no streams found")
	}
	if modeResult.stream == nil {
		return pageData, fmt.Errorf("no streams found for mode %s", modeResult.mode)
	}

	return pageData, nil
}

type watchAnimeEpisodes struct {
	anime        domain.Anime
	episodes     domain.CanonicalEpisodeList
	searchTitles []string
}

func (s *playbackService) loadWatchAnimeEpisodes(ctx context.Context, animeID int, episode string, titleCandidates []string, stagePrefix string) (watchAnimeEpisodes, error) {
	animeStartedAt := time.Now()
	animeData, err := s.watchAnime(ctx, animeID)
	logWatchDataStage(stagePrefix+"anime_metadata", animeID, episode, animeStartedAt, nil)
	if err != nil {
		return watchAnimeEpisodes{}, fmt.Errorf("failed to fetch anime: %w", err)
	}

	ensureStartedAt := time.Now()
	if err := s.ensureAnimeRow(ctx, animeData); err != nil {
		slog.Warn("upsert_anime_failed", "component", "playback", "fields", map[string]any{"anime_id": animeID}, "error", err)
	}
	logWatchDataStage(stagePrefix+"anime_row", animeID, episode, ensureStartedAt, nil)

	episodesStartedAt := time.Now()
	episodes, err := s.episodes.GetCanonicalEpisodes(ctx, animeData, false)
	logWatchDataStage(stagePrefix+"canonical_episodes", animeID, episode, episodesStartedAt, map[string]any{"episodes": len(episodes.Episodes)})
	if err != nil {
		return watchAnimeEpisodes{}, fmt.Errorf("failed to fetch episodes: %w", err)
	}

	return watchAnimeEpisodes{
		anime:        animeData,
		episodes:     episodes,
		searchTitles: buildSearchTitles(animeData, titleCandidates),
	}, nil
}

func (s *playbackService) watchEpisodeMapping(ctx context.Context, animeID int) (domain.AnimeMediaMapping, bool) {
	mapping, err := s.repo.GetAnimeMappingByMALID(ctx, int64(animeID))
	if err == nil && mapping.MediaType == "tv" && mapping.TMDBID > 0 && mapping.Season > 0 {
		return mapping, true
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		slog.Warn("watch_episode_mapping_failed", "component", "playback", "fields", map[string]any{"anime_id": animeID}, "error", err)
	}
	return domain.AnimeMediaMapping{}, false
}

func (s *playbackService) watchDisplayEpisodes(ctx context.Context, loaded watchAnimeEpisodes, providerEpisode string) domain.CanonicalEpisodeList {
	out := loaded.episodes
	out.Episodes = append([]domain.CanonicalEpisode(nil), loaded.episodes.Episodes...)
	if mapping, ok := s.watchEpisodeMapping(ctx, loaded.anime.MalID); ok {
		titles := s.tmdbSeasonEpisodeTitles(ctx, mapping)
		for index := range out.Episodes {
			if title := strings.TrimSpace(titles[out.Episodes[index].Number]); title != "" {
				out.Episodes[index].Title = title
			}
		}
	}
	return markWatchEpisodeContext(out, loaded.anime.MalID, providerEpisode)
}

func (s *playbackService) tmdbSeasonEpisodeTitles(ctx context.Context, mapping domain.AnimeMediaMapping) map[int]string {
	if s.tmdbClient == nil || mapping.MediaType != string(tmdb.MediaTypeTV) || mapping.TMDBID <= 0 || mapping.Season < 0 {
		return nil
	}
	segments, segmentErr := s.repo.GetAnimeMappingSegments(ctx, mapping)
	if segmentErr == nil && len(segments) > 0 {
		return s.tmdbSegmentEpisodeTitles(ctx, mapping, segments)
	}
	return s.singleTMDBSeasonEpisodeTitles(ctx, mapping)
}

func (s *playbackService) singleTMDBSeasonEpisodeTitles(ctx context.Context, mapping domain.AnimeMediaMapping) map[int]string {
	season, err := s.tmdbClient.GetSeasonMetadata(ctx, mapping.TMDBID, mapping.Season, "en-US")
	if err != nil {
		slog.Warn("watch_episode_tmdb_season_failed", "component", "playback", "fields", map[string]any{
			"tmdb_id":     mapping.TMDBID,
			"tmdb_season": mapping.Season,
		}, "error", err)
		return nil
	}
	titles := make(map[int]string, len(season.Episodes))
	for _, episode := range season.Episodes {
		if title := strings.TrimSpace(episode.Name); episode.EpisodeNumber > 0 && title != "" {
			titles[episode.EpisodeNumber] = title
		}
	}
	return titles
}

func (s *playbackService) tmdbSegmentEpisodeTitles(ctx context.Context, mapping domain.AnimeMediaMapping, segments []domain.AnimeMediaSegment) map[int]string {
	titles := make(map[int]string)
	for _, segment := range segments {
		for number, title := range s.tmdbSegmentTitles(ctx, mapping, segment) {
			titles[number] = title
		}
	}
	return titles
}

func (s *playbackService) tmdbSegmentTitles(ctx context.Context, mapping domain.AnimeMediaMapping, segment domain.AnimeMediaSegment) map[int]string {
	titles := make(map[int]string)
	if segment.Season <= 0 {
		return titles
	}
	season, err := s.tmdbClient.GetSeasonMetadata(ctx, mapping.TMDBID, segment.Season, "en-US")
	if err != nil {
		slog.Warn("watch_episode_tmdb_segment_failed", "component", "playback", "fields", map[string]any{
			"tmdb_id": mapping.TMDBID, "tmdb_season": segment.Season,
		}, "error", err)
		return titles
	}
	for _, episode := range season.Episodes {
		if number, title, ok := mappedSegmentEpisode(segment, episode); ok {
			titles[number] = title
		}
	}
	return titles
}

func mappedSegmentEpisode(segment domain.AnimeMediaSegment, episode tmdb.Episode) (int, string, bool) {
	if segment.TMDBEpisodeMin > 0 && episode.EpisodeNumber < segment.TMDBEpisodeMin || segment.TMDBEpisodeMax > 0 && episode.EpisodeNumber > segment.TMDBEpisodeMax {
		return 0, "", false
	}
	number := episode.EpisodeNumber
	if segment.SourceEpisodeMin > 0 && segment.TMDBEpisodeMin > 0 {
		number = segment.SourceEpisodeMin + episode.EpisodeNumber - segment.TMDBEpisodeMin
	}
	title := strings.TrimSpace(episode.Name)
	return number, title, number > 0 && title != ""
}

func markWatchEpisodeContext(input domain.CanonicalEpisodeList, animeID int, providerEpisode string) domain.CanonicalEpisodeList {
	out := input
	out.Episodes = append([]domain.CanonicalEpisode(nil), input.Episodes...)
	for i := range out.Episodes {
		if out.Episodes[i].AnimeID == 0 {
			out.Episodes[i].AnimeID = animeID
		}
		out.Episodes[i].Current = out.Episodes[i].AnimeID == animeID && out.Episodes[i].PlaybackID() == providerEpisode
	}
	return out
}

type watchBranchInput struct {
	ctx                         context.Context
	animeID                     int
	searchTitles                []string
	episode, mode, from, userID string
	totalEpisodes               int
	allowStale, deferred        bool
}

func (s *playbackService) loadWatchBranches(input watchBranchInput) (watchModeResult, watchProgressResult, []domain.SkipSegment) {
	branchCtx, cancel := context.WithCancel(input.ctx)
	defer cancel()

	var (
		wg         sync.WaitGroup
		modeResult watchModeResult
		progress   watchProgressResult
		segments   []domain.SkipSegment
	)

	wg.Go(func() {
		startedAt := time.Now()
		modeSources, stream, resolvedMode, switchedFrom := s.watchModeSources(watchModeInput{ctx: branchCtx, animeID: input.animeID, searchTitles: input.searchTitles, episode: input.episode, mode: input.mode, from: input.from, allowStale: input.allowStale, deferred: input.deferred})
		modeResult = watchModeResult{
			sources: modeSources,
			stream:  stream,
			mode:    resolvedMode,
			from:    switchedFrom,
		}
		logWatchDataStage("stream_resolution", input.animeID, input.episode, startedAt, map[string]any{
			"sources":       len(modeSources),
			"mode":          resolvedMode,
			"switched_from": switchedFrom,
			"deferred":      input.deferred,
		})
	})

	wg.Go(func() {
		startedAt := time.Now()
		startTime, watchlistStatus, watchlistIDs := s.loadWatchProgress(branchCtx, input.userID, input.animeID, input.totalEpisodes, input.episode)
		progress = watchProgressResult{
			startTime:       startTime,
			watchlistStatus: watchlistStatus,
			watchlistIDs:    watchlistIDs,
		}
		logWatchDataStage("progress_lookup", input.animeID, input.episode, startedAt, map[string]any{
			"authenticated":    input.userID != "",
			"resume":           startTime > 0,
			"watchlist_status": watchlistStatus,
		})
	})

	wg.Go(func() {
		startedAt := time.Now()
		segments = s.watchSegments(branchCtx, input.userID, input.animeID, input.episode, input.deferred)
		logWatchDataStage("segment_lookup", input.animeID, input.episode, startedAt, map[string]any{
			"segments": len(segments),
			"deferred": input.deferred,
		})
	})

	wg.Wait()
	return modeResult, progress, segments
}

func (s *playbackService) EnrichEpisodeClassifications(ctx context.Context, animeID int) ([]domain.CanonicalEpisode, error) {
	anime, err := s.watchAnime(ctx, animeID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch anime for episode classifications: %w", err)
	}
	enricher, ok := s.episodes.(domain.EpisodeClassificationService)
	if !ok {
		return nil, errors.New("episode classification enrichment is unavailable")
	}
	episodes, err := enricher.EnrichEpisodeClassifications(ctx, anime)
	if err != nil {
		return nil, err
	}
	return episodes.Episodes, nil
}

func (s *playbackService) watchAnime(ctx context.Context, animeID int) (domain.Anime, error) {
	if s.metadata != nil {
		anime, err := s.metadata.GetAnimeByMALID(ctx, animeID)
		if err == nil {
			return anilist.ToMetadataAnime(anime), nil
		}
	}

	row, err := s.repo.GetAnime(ctx, int64(animeID))
	if err == nil && row.ID > 0 && strings.TrimSpace(row.TitleOriginal) != "" {
		anime := domain.Anime{
			MalID:         int(row.ID),
			Title:         row.TitleOriginal,
			TitleEnglish:  row.TitleEnglish.String,
			TitleJapanese: row.TitleJapanese.String,
			Airing:        row.Airing.Valid && row.Airing.Bool,
			Status:        row.Status.String,
		}
		return anime, nil
	}

	return domain.Anime{}, errors.New("metadata provider unavailable")
}

type watchModeInput struct {
	ctx                  context.Context
	animeID              int
	searchTitles         []string
	episode, mode, from  string
	allowStale, deferred bool
}

func (s *playbackService) watchModeSources(input watchModeInput) (map[string]domain.ModeSource, *domain.StreamResult, string, string) {
	if input.deferred {
		return map[string]domain.ModeSource{}, nil, input.mode, input.from
	}

	request := sourceResolutionInput{ctx: input.ctx, animeID: input.animeID, searchTitles: input.searchTitles, episode: input.episode, mode: input.mode, allowStale: input.allowStale, forceRefresh: domain.PlaybackSourceRefreshRequested(input.ctx)}
	modeSources, result, resolvedMode, switchedFrom := s.resolveModeSources(request)
	if resolvedMode != "" {
		input.mode = resolvedMode
	}
	if switchedFrom != "" {
		input.from = switchedFrom
	}
	return modeSources, result, input.mode, input.from
}

func (s *playbackService) watchSegments(ctx context.Context, userID string, animeID int, episode string, deferred bool) []domain.SkipSegment {
	if deferred {
		return []domain.SkipSegment{}
	}
	segments, err := s.fetchSkipSegments(ctx, userID, animeID, episode)
	if err != nil {
		slog.Warn("fetch_skip_segments_failed", "component", "playback", "fields", map[string]any{"anime_id": animeID, "episode": episode}, "error", err)
	}
	return segments
}

type watchDataPayloadInput struct {
	anime                  domain.Anime
	animeID                int
	episode                string
	startTime              float64
	episodes               []domain.CanonicalEpisode
	modeSources            map[string]domain.ModeSource
	mode, modeSwitchedFrom string
	segments               []domain.SkipSegment
}

func buildWatchDataPayload(input watchDataPayloadInput) domain.WatchData {
	return domain.WatchData{
		MalID:            input.animeID,
		Title:            input.anime.DisplayTitle(),
		CurrentEpisode:   input.episode,
		StartTimeSeconds: input.startTime,
		Episodes:         input.episodes,
		Providers: []domain.ProviderData{{Streams: []domain.ProviderStream{{
			Name:      "Primary",
			Quality:   "Auto",
			MalID:     input.animeID,
			IsCurrent: true,
		}}}},
		ModeSources:      input.modeSources,
		InitialMode:      input.mode,
		ModeSwitchedFrom: input.modeSwitchedFrom,
		AvailableModes:   availableModes(input.modeSources),
		Segments:         input.segments,
		Airing:           input.anime.Airing,
	}
}

type watchPageDataInput struct {
	anime                    domain.Anime
	animeID                  int
	episodes                 []domain.CanonicalEpisode
	episode, watchlistStatus string
	watchlistIDs             []int64
	seasons                  []domain.SeasonEntry
	watchData                domain.WatchData
}

func buildWatchPageData(input watchPageDataInput) domain.WatchPageData {
	return domain.WatchPageData{
		WatchData:       input.watchData,
		Anime:           input.anime,
		AnimeID:         input.animeID,
		Episodes:        input.episodes,
		EpisodeTotal:    maxEpisodeNumber(input.episodes),
		CurrentEpID:     input.episode,
		WatchlistStatus: input.watchlistStatus,
		WatchlistIDs:    input.watchlistIDs,
		Seasons:         input.seasons,
	}
}

func maxEpisodeNumber(episodes []domain.CanonicalEpisode) int {
	maxNumber := 0
	for _, episode := range episodes {
		if episode.Number > maxNumber {
			maxNumber = episode.Number
		}
	}
	return maxNumber
}

func logWatchDataStage(stage string, animeID int, episode string, startedAt time.Time, fields map[string]any) {
	logFields := map[string]any{
		"anime_id":    animeID,
		"duration_ms": time.Since(startedAt).Milliseconds(),
		"stage":       stage,
	}
	if episode != "" {
		logFields["episode"] = episode
	}
	maps.Copy(logFields, fields)
	slog.Info("watch_data_stage", "component", "playback", "fields", logFields)
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

	for _, ep := range episodes {
		if ep.PlaybackID() == episode && !ep.HasDub && ep.HasSub {
			return "sub", requestedMode
		}
	}

	return requestedMode, ""
}

type sourceResolutionInput struct {
	ctx                      context.Context
	animeID                  int
	searchTitles             []string
	episode, mode            string
	allowStale, forceRefresh bool
}

func (s *playbackService) resolveModeSources(input sourceResolutionInput) (map[string]domain.ModeSource, *domain.StreamResult, string, string) {
	requestedMode := normalizeSourceMode(input.mode)
	input.mode = requestedMode
	if res := s.resolveStreamResult(input); res != nil {
		return map[string]domain.ModeSource{
			requestedMode: s.buildModeSource(res),
		}, res, requestedMode, ""
	}

	for _, fallbackMode := range fallbackModes(requestedMode) {
		input.mode = fallbackMode
		res := s.resolveStreamResult(input)
		if res == nil {
			continue
		}
		return map[string]domain.ModeSource{
			fallbackMode: s.buildModeSource(res),
		}, res, fallbackMode, requestedMode
	}

	return map[string]domain.ModeSource{}, nil, requestedMode, ""
}

func (s *playbackService) resolveStreamResult(input sourceResolutionInput) *domain.StreamResult {
	key := newSourceCacheKey(input.animeID, input.episode, input.mode)
	stale, state := s.sourceCache.get(key, time.Now())
	if !input.forceRefresh && state == sourceCacheFresh {
		slog.Info("playback_source_cache_hit", "component", "playback", "fields", map[string]any{"anime_id": input.animeID, "episode": input.episode, "mode": key.mode})
		return stale
	}
	slog.Info("playback_source_cache_miss", "component", "playback", "fields", map[string]any{"anime_id": input.animeID, "episode": input.episode, "mode": key.mode, "forced": input.forceRefresh})
	resolved := s.waitForSourceResult(input, key)
	if !resolved.completed {
		return nil
	}
	slog.Info("playback_source_resolution", "component", "playback", "fields", map[string]any{
		"anime_id": input.animeID, "episode": input.episode, "mode": key.mode,
		"duration_ms": resolved.duration.Milliseconds(), "shared": resolved.shared,
	})
	if resolved.err == nil {
		return cloneStreamResult(resolved.result)
	}
	if input.allowStale && state == sourceCacheStale && stale != nil {
		slog.Warn("playback_source_cache_stale_hit", "component", "playback", "fields", map[string]any{"anime_id": input.animeID, "episode": input.episode, "mode": key.mode}, "error", errors.New("provider source refresh failed"))
		return stale
	}
	slog.Warn("playback_source_resolution_failed", "component", "playback", "fields", map[string]any{"anime_id": input.animeID, "episode": input.episode, "mode": key.mode}, "error", resolved.err)
	return nil
}

func (s *playbackService) waitForSourceResult(input sourceResolutionInput, key sourceCacheKey) sourceResolutionResult {
	startedAt := time.Now()
	resultCh := s.sourceFlight.DoChan(key.flightKey(), func() (any, error) {
		return s.resolveSource(key, input.animeID, input.searchTitles, input.forceRefresh)
	})
	select {
	case <-input.ctx.Done():
		return sourceResolutionResult{err: input.ctx.Err(), duration: time.Since(startedAt)}
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
				slog.Info("playback_source_cache_eviction", "component", "playback")
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
			slog.Warn("sign_subtitle_token_failed", "component", "playback", "error", err)
		}
		subtitles = append(subtitles, domain.SubtitleItem{
			Lang:  sub.Label,
			Token: token,
		})
	}

	streamToken, err := s.SignProxyToken(res.URL, res.Referer, "stream")
	if err != nil {
		slog.Warn("sign_stream_token_failed", "component", "playback", "error", err)
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
