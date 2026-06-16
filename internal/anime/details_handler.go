package anime

import (
	"context"
	"fmt"
	"mal/integrations/jikan"
	"mal/internal/domain"
	"mal/internal/observability"
	"mal/internal/server"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	animeSectionTimeout = 12 * time.Second
	watchOrderTimeout   = 15 * time.Second
	audioLookupTimeout  = 8 * time.Second
)

func releasedEpisodeCount(anime domain.Anime, now time.Time) int {
	if !anime.Airing || anime.Aired.From == "" {
		return 0
	}

	firstAired, err := time.Parse(time.RFC3339, anime.Aired.From)
	if err != nil || now.Before(firstAired) {
		return 0
	}

	count := int(now.Sub(firstAired)/(7*24*time.Hour)) + 1
	if anime.Episodes > 0 && count > anime.Episodes {
		return anime.Episodes
	}
	return count
}

func animeAudioAvailabilityLabel(episodes []domain.CanonicalEpisode) string {
	hasKnownSub := false
	for _, episode := range episodes {
		if episode.HasDub {
			return "Dub available"
		}
		if episode.HasSub || episode.SubOnly {
			hasKnownSub = true
		}
	}
	if hasKnownSub {
		return "Subtitled only"
	}
	return ""
}

func (h *AnimeHandler) animeAudioAvailability(ctx context.Context, anime domain.Anime) string {
	if h.episodeSvc == nil {
		return ""
	}

	audioCtx, cancel := context.WithTimeout(ctx, audioLookupTimeout)
	defer cancel()

	episodeList, err := h.episodeSvc.GetCanonicalEpisodes(audioCtx, anime, true)
	if err != nil {
		observability.Warn(
			"anime_audio_availability_fetch_failed",
			"anime",
			"",
			map[string]any{
				"anime_id": anime.MalID,
			},
			err,
		)
		return ""
	}
	if episodeList.Source != "AllAnime" {
		return ""
	}

	return animeAudioAvailabilityLabel(episodeList.Episodes)
}

func (h *AnimeHandler) HandleAnimeDetails(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	section := c.Query("section")
	if section != "" && c.GetHeader("HX-Request") == "true" {
		h.handleAnimeDetailsSection(c, id, section)
		return
	}

	anime, err := h.svc.GetAnimeByID(c.Request.Context(), id)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	h.svc.WarmDetailSections(id)

	user := server.CurrentUser(c)
	status := ""
	var watchlistIDs []int64
	ep := 0
	var cwSeconds float64
	if user != nil {
		entry, err := h.watchlistSvc.GetWatchListEntry(c.Request.Context(), user.ID, int64(id))
		if err == nil {
			status = entry.Status
			watchlistIDs = []int64{entry.AnimeID}
		}

		cwEntry, err := h.watchlistSvc.GetContinueWatchingEntry(c.Request.Context(), user.ID, int64(id))
		if err == nil && cwEntry.CurrentEpisode.Valid {
			ep = int(cwEntry.CurrentEpisode.Int64)
			cwSeconds = cwEntry.CurrentTimeSeconds
		}
	}

	audioAvailability := h.animeAudioAvailability(c.Request.Context(), anime)
	episodesCount := releasedEpisodeCount(anime, time.Now())

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"Anime":                anime,
		"AudioAvailability":    audioAvailability,
		"CurrentPath":          fmt.Sprintf("/anime/%d", id),
		"User":                 user,
		"Status":               status,
		"WatchlistIDs":         watchlistIDs,
		"ContinueWatchingEp":   ep,
		"ContinueWatchingTime": cwSeconds,
		"EpisodesCount":        episodesCount,
	})
}

func (h *AnimeHandler) handleAnimeDetailsSection(c *gin.Context, id int, section string) {
	sectionCtx, cancel := context.WithTimeout(c.Request.Context(), animeSectionTimeout)
	defer cancel()

	data, tplName, err := h.loadAnimeDetailsSection(sectionCtx, id, section)
	if err != nil {
		observability.Warn(
			"anime_section_fetch_failed",
			"anime",
			"",
			map[string]any{
				"section":  section,
				"anime_id": id,
			},
			err,
		)
		if section == "recommendations" {
			c.HTML(http.StatusOK, "anime.gohtml", gin.H{
				"_fragment": "anime_recommendations_loading",
				"AnimeID":   id,
			})
			return
		}
		c.Status(http.StatusNoContent)
		return
	}

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"_fragment": tplName,
		"Items":     data,
	})
}

func (h *AnimeHandler) loadAnimeDetailsSection(ctx context.Context, id int, section string) (any, string, error) {
	switch section {
	case "characters":
		data, err := h.svc.GetCharacters(ctx, id)
		return data, "anime_characters", err
	case "recommendations":
		data, err := h.svc.GetRecommendations(ctx, id)
		return data, "anime_recommendations", err
	case "statistics":
		data, err := h.svc.GetStatistics(ctx, id)
		return data, "anime_statistics", err
	case "themes":
		data, err := h.svc.GetThemes(ctx, id)
		return data, "anime_themes", err
	default:
		return nil, "", nil
	}
}

func (h *AnimeHandler) HandleHTMLWatchOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Query("animeId"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	userID := server.CurrentUserID(c)
	mode := jikan.NormalizeWatchOrderMode(c.Query("mode"))

	relationsCtx, cancel := context.WithTimeout(c.Request.Context(), watchOrderTimeout)
	defer cancel()

	relations, err := h.svc.GetRelations(relationsCtx, id, mode)
	if err != nil {
		observability.Warn(
			"relations_fetch_failed",
			"anime",
			"",
			map[string]any{
				"anime_id": id,
			},
			err,
		)
		c.HTML(http.StatusOK, "anime.gohtml", gin.H{
			"_fragment": "watch_order_loading",
			"AnimeID":   id,
			"Mode":      string(mode),
		})
		return
	}

	relationAnimeIDs := make([]int64, 0, len(relations))
	for _, relation := range relations {
		if relation.Anime.MalID > 0 {
			relationAnimeIDs = append(relationAnimeIDs, int64(relation.Anime.MalID))
		}
	}
	watchlistMap := h.watchlistMapForIDs(c.Request.Context(), userID, relationAnimeIDs)

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"_fragment":    "watch_order",
		"Relations":    relations,
		"AnimeID":      id,
		"Mode":         string(mode),
		"WatchlistMap": watchlistMap,
	})
}
