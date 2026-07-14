package anime

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"mal/internal/domain"
	"mal/internal/server"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	animeSectionTimeout = 12 * time.Second
	audioLookupTimeout  = 8 * time.Second
	episodeCountTimeout = 4 * time.Second
)

type animeReleaseInfoDisplay struct {
	Count  int
	Label  string
	Status string
}

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

func (h *AnimeHandler) animeReleaseInfo(ctx context.Context, anime domain.Anime, now time.Time) animeReleaseInfoDisplay {
	if h.episodeSvc != nil {
		episodeCtx, cancel := context.WithTimeout(ctx, episodeCountTimeout)
		defer cancel()

		episodeList, err := h.episodeSvc.GetCanonicalEpisodes(episodeCtx, anime, false)
		if err == nil {
			return releaseInfoFromCanonical(anime, episodeList)
		} else {
			slog.Warn("anime_episode_availability_count_fetch_failed", "component", "anime", "fields", map[string]any{
				"anime_id": anime.MalID,
			}, "error", err)
		}
	}

	return animeInitialReleaseInfo(anime, now)
}

func releaseInfoFromCanonical(anime domain.Anime, episodeList domain.CanonicalEpisodeList) animeReleaseInfoDisplay {
	info := animeReleaseInfoDisplay{Status: trustedAnimeStatus(anime, len(episodeList.Episodes))}
	if count := len(episodeList.Episodes); count > 0 {
		info.Count = count
		info.Label = canonicalEpisodeCountLabel(episodeList.Source)
	}
	return info
}

func canonicalEpisodeCountLabel(_ string) string {
	return "Available episodes"
}

func animeInitialReleaseInfo(anime domain.Anime, now time.Time) animeReleaseInfoDisplay {
	if isCurrentlyAiring(anime) {
		return animeReleaseInfoDisplay{}
	}

	info := animeReleaseInfoDisplay{Status: strings.TrimSpace(anime.Status)}
	if anime.Episodes > 0 {
		info.Count = anime.Episodes
		info.Label = "Total episodes"
		return info
	}
	if count := releasedEpisodeCount(anime, now); count > 0 {
		info.Count = count
		info.Label = "Estimated aired episodes"
	}
	return info
}

func trustedAnimeStatus(anime domain.Anime, canonicalEpisodes int) string {
	if canonicalEpisodes == 0 && isCurrentlyAiring(anime) {
		return "Not yet aired"
	}
	if status := strings.TrimSpace(anime.Status); status != "" {
		return status
	}
	if anime.Airing {
		return "Currently Airing"
	}
	return ""
}

func isCurrentlyAiring(anime domain.Anime) bool {
	return anime.Airing || strings.EqualFold(strings.TrimSpace(anime.Status), "Currently Airing")
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
		slog.Warn("anime_audio_availability_fetch_failed", "component", "anime", "fields", map[string]any{
			"anime_id": anime.MalID,
		}, "error", err)

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
		server.RespondNotFound(c)
		return
	}
	h.applySelectedAnimeMedia(c.Request.Context(), &anime)

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

	releaseInfo := animeInitialReleaseInfo(anime, time.Now())

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"Anime":                anime,
		"CurrentPath":          fmt.Sprintf("/anime/%d", id),
		"User":                 user,
		"Status":               status,
		"WatchlistIDs":         watchlistIDs,
		"ContinueWatchingEp":   ep,
		"ContinueWatchingTime": cwSeconds,
		"ReleaseInfo":          releaseInfo,
	})
}

func (h *AnimeHandler) handleAnimeDetailsSection(c *gin.Context, id int, section string) {
	sectionCtx, cancel := context.WithTimeout(c.Request.Context(), animeSectionTimeout)
	defer cancel()

	data, tplName, err := h.loadAnimeDetailsSection(sectionCtx, id, section)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		slog.Warn("anime_section_fetch_failed", "component", "anime", "fields", map[string]any{
			"section":  section,
			"anime_id": id,
		}, "error", err)

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
	case "episode-count", "release-info":
		anime, err := h.svc.GetAnimeByID(ctx, id)
		if err != nil {
			return nil, "", err
		}
		return h.animeReleaseInfo(ctx, anime, time.Now()), "anime_release_info", nil
	case "audio-availability":
		anime, err := h.svc.GetAnimeByID(ctx, id)
		if err != nil {
			return nil, "", err
		}
		return h.animeAudioAvailability(ctx, anime), "anime_audio_availability", nil
	default:
		return nil, "", nil
	}
}
