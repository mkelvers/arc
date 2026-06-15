package playback

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"mal/integrations/jikan"
	"mal/internal/domain"
	"mal/internal/observability"
)

func (s *playbackService) BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (domain.WatchPageData, error) {
	anime, err := s.jikan.GetAnimeByID(ctx, animeID)
	if err != nil {
		return domain.WatchPageData{}, fmt.Errorf("failed to fetch anime: %w", err)
	}

	animeData := domain.Anime{Anime: anime}
	s.ensureAnimeRow(ctx, animeData)
	searchTitles := buildSearchTitles(animeData, titleCandidates)
	canonicalEpisodes, err := s.episodes.GetCanonicalEpisodes(ctx, animeData, false)
	if err != nil {
		return domain.WatchPageData{}, fmt.Errorf("failed to fetch episodes: %w", err)
	}

	mode, modeSwitchedFrom := resolveMode(episode, mode, canonicalEpisodes.Episodes)
	modeSources, result, resolvedMode, resolvedModeSwitchedFrom := s.resolveModeSources(ctx, animeID, searchTitles, episode, mode)
	if resolvedMode != "" {
		mode = resolvedMode
	}
	if resolvedModeSwitchedFrom != "" {
		modeSwitchedFrom = resolvedModeSwitchedFrom
	}
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

func (s *playbackService) resolveModeSources(ctx context.Context, animeID int, searchTitles []string, episode string, requestedMode string) (map[string]domain.ModeSource, *domain.StreamResult, string, string) {
	if res := s.resolveStreamResult(ctx, animeID, searchTitles, episode, requestedMode); res != nil {
		return map[string]domain.ModeSource{
			requestedMode: s.buildModeSource(res),
		}, res, requestedMode, ""
	}

	for _, fallbackMode := range fallbackModes(requestedMode) {
		res := s.resolveStreamResult(ctx, animeID, searchTitles, episode, fallbackMode)
		if res == nil {
			continue
		}
		return map[string]domain.ModeSource{
			fallbackMode: s.buildModeSource(res),
		}, res, fallbackMode, requestedMode
	}

	return map[string]domain.ModeSource{}, nil, requestedMode, ""
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
	subtitles := make([]domain.SubtitleItem, 0, len(res.Subtitles))
	for _, sub := range res.Subtitles {
		token, err := s.SignProxyToken(sub.URL, res.Referer, "subtitle")
		if err != nil {
			observability.LogJSON(observability.LogLevelWarn, "sign_subtitle_token_failed", "playback", err.Error(), map[string]any{"url": sub.URL}, nil)
		}
		subtitles = append(subtitles, domain.SubtitleItem{
			Lang:  sub.Label,
			Token: token,
		})
	}

	streamToken, err := s.SignProxyToken(res.URL, res.Referer, "stream")
	if err != nil {
		observability.LogJSON(observability.LogLevelWarn, "sign_stream_token_failed", "playback", err.Error(), map[string]any{"url": res.URL}, nil)
	}
	return domain.ModeSource{
		Token:     streamToken,
		Type:      res.Type,
		Subtitles: subtitles,
	}
}

func (s *playbackService) loadSeasons(ctx context.Context, animeID int) []domain.SeasonEntry {
	relations, _ := s.jikan.GetFullRelations(ctx, animeID, jikan.WatchOrderModeMain)
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
