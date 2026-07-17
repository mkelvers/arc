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
	episodes, err := h.episodeSvc.GetCanonicalEpisodes(ctx, anime, false)
	if err != nil {
		slog.Warn("continue_watching_episode_fetch_failed", "component", "anime", "fields", map[string]any{
			"anime_id": anime.MalID,
		}, "error", err)
		return "", false
	}
	episode, ok := canonicalEpisodeByNumber(episodes.Episodes, episodeNumber)
	if !ok {
		return "", false
	}
	mappings := h.releaseEpisodeMappings(ctx, anime, mapping, true)
	sources := []animeEpisodeSource{{Anime: anime, Episodes: episodes.Episodes}}
	media := h.tmdbReleaseEpisodes(ctx, anime, mappings, sources)[episodeNumber]
	return animeEpisodeTitle(episode, media), true
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
