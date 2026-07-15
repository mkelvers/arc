package anime

import (
	"context"
	"log/slog"
	"mal/integrations/tmdb"
	"mal/internal/domain"
)

func (h *AnimeHandler) enrichContinueWatchingEntries(ctx context.Context, entries []domain.ContinueWatchingEntryDisplay) {
	for i := range entries {
		episode := int(entries[i].CurrentEpisode.Int64)
		if !entries[i].CurrentEpisode.Valid || episode <= 0 {
			continue
		}
		title, ok := h.continueWatchingEpisodeTitle(ctx, int(entries[i].AnimeID), episode)
		if ok {
			entries[i].EpisodeTitle = title
		}
	}
}

func (h *AnimeHandler) continueWatchingEpisodeTitle(ctx context.Context, animeID int, episodeNumber int) (string, bool) {
	anime, err := h.svc.GetAnimeByID(ctx, animeID)
	if err != nil {
		slog.Warn("continue_watching_anime_fetch_failed", "component", "anime", "fields", map[string]any{
			"anime_id": animeID,
		}, "error", err)
		return "", false
	}

	mapping, ok := h.resolveAnimeTMDBMapping(ctx, anime)
	if ok && mapping.Group.MediaType == string(tmdb.MediaTypeTV) && mapping.Group.TMDBID > 0 {
		if title, ok := h.continueWatchingMappedEpisodeTitle(ctx, anime, mapping, episodeNumber); ok {
			return title, true
		}
	}
	return h.continueWatchingLocalEpisodeTitle(ctx, anime, episodeNumber)
}

func (h *AnimeHandler) continueWatchingMappedEpisodeTitle(ctx context.Context, anime domain.Anime, mapping animeMapping, episodeNumber int) (string, bool) {
	if h.episodeSvc == nil {
		return "", false
	}

	remaining := episodeNumber
	seasonMediaOffsets := map[int]int{}
	for _, candidate := range h.continueWatchingGroupMappings(ctx, mapping) {
		title, count, ok := h.continueWatchingCandidateEpisodeTitle(ctx, anime, candidate, remaining, seasonMediaOffsets[candidate.Season])
		if count <= 0 {
			continue
		}
		if ok {
			return title, true
		}
		remaining -= count
		seasonMediaOffsets[candidate.Season] += count
	}

	return "", false
}

func (h *AnimeHandler) continueWatchingGroupMappings(ctx context.Context, mapping animeMapping) []animeMapping {
	if h.mappings == nil {
		return []animeMapping{mapping}
	}
	mappings, err := h.mappings.GroupMappings(ctx, mapping.Group)
	if err != nil {
		slog.Warn("continue_watching_group_mappings_failed", "component", "anime", "fields", map[string]any{
			"tmdb_media_type": mapping.Group.MediaType,
			"tmdb_id":         mapping.Group.TMDBID,
		}, "error", err)
		return []animeMapping{mapping}
	}
	if len(mappings) == 0 {
		return []animeMapping{mapping}
	}
	return mappings
}

func (h *AnimeHandler) continueWatchingCandidateEpisodeTitle(ctx context.Context, anime domain.Anime, mapping animeMapping, remaining int, mediaOffset int) (string, int, bool) {
	if mapping.MALID <= 0 || mapping.Season <= 0 {
		return "", 0, false
	}
	sourceAnime, ok := h.episodeSourceAnime(ctx, anime, mapping.MALID)
	if !ok {
		return "", 0, false
	}
	episodes, err := h.episodeSvc.GetCanonicalEpisodes(ctx, sourceAnime, false)
	if err != nil {
		slog.Warn("continue_watching_episode_fetch_failed", "component", "anime", "fields", map[string]any{
			"anime_id": sourceAnime.MalID,
		}, "error", err)
		return "", 0, false
	}
	count := domain.RegularEpisodeCount(episodes.Episodes)
	if count == 0 || remaining > count {
		return "", count, false
	}
	episode, ok := canonicalEpisodeByNumber(episodes.Episodes, remaining)
	if !ok {
		return "", count, false
	}
	mediaNumber := mediaOffset + remaining
	media := h.tmdbSeasonEpisodes(ctx, sourceAnime, mapping, true, mapping.Season, nil)[mediaNumber]
	return animeEpisodeTitle(episode, media), count, true
}

func (h *AnimeHandler) continueWatchingLocalEpisodeTitle(ctx context.Context, anime domain.Anime, episodeNumber int) (string, bool) {
	if h.episodeSvc == nil {
		return "", false
	}
	episodes, err := h.episodeSvc.GetCanonicalEpisodes(ctx, anime, false)
	if err != nil {
		return "", false
	}
	episode, ok := canonicalEpisodeByNumber(episodes.Episodes, episodeNumber)
	if !ok {
		return "", false
	}
	return animeEpisodeTitle(episode, tmdb.Episode{}), true
}

func canonicalEpisodeByNumber(episodes []domain.CanonicalEpisode, number int) (domain.CanonicalEpisode, bool) {
	for _, episode := range episodes {
		if episode.Number == number {
			return episode, true
		}
	}
	return domain.CanonicalEpisode{}, false
}
