package anime

import (
	"mal/internal/observability"
	"mal/internal/server"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func (h *AnimeHandler) HandleSimulcast(c *gin.Context) {
	now := time.Now()
	current := calendarSeason(now.Year(), int(now.Month()))
	latest := h.discoverySvc.LatestAvailableSeason(c.Request.Context(), current)
	selected := seasonSelection(c.Query("season"), c.Query("year"), current, latest)
	data, err := h.discoverySvc.GetSimulcast(c.Request.Context(), selected)
	if err != nil {
		observability.WarnContext(c.Request.Context(), "simulcast_fetch_failed", "anime", "", nil, err)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), server.CurrentUserID(c), data.Animes)
	previous, next := seasonNavigation(selected, 2018, latest)
	c.HTML(http.StatusOK, "simulcast.gohtml", gin.H{
		"CurrentPath":   "/simulcast",
		"User":          server.CurrentUser(c),
		"Animes":        data.Animes,
		"Season":        data.Season,
		"SeasonLabel":   strings.ToUpper(data.Season[:1]) + data.Season[1:],
		"Year":          data.Year,
		"SeasonOptions": seasonOptions(2018, latest),
		"Previous":      previous,
		"Next":          next,
		"WatchlistMap":  watchlistMap,
	})
}

func (h *AnimeHandler) HandleSearch(c *gin.Context) {
	c.HTML(http.StatusOK, "search.gohtml", gin.H{
		"User":        server.CurrentUser(c),
		"CurrentPath": "/search",
	})
}

func (h *AnimeHandler) HandleCatalog(c *gin.Context) {
	user := server.CurrentUser(c)

	c.HTML(http.StatusOK, "index.gohtml", gin.H{
		"CurrentPath":  "/",
		"User":         user,
		"WatchlistMap": map[int64]bool{},
	})
}

func (h *AnimeHandler) HandleCatalogAiring(c *gin.Context) {
	h.renderCatalogSection(c, "Airing")
}

func (h *AnimeHandler) HandleCatalogPopular(c *gin.Context) {
	h.renderCatalogSection(c, "Popular")
}

func (h *AnimeHandler) HandleCatalogContinue(c *gin.Context) {
	h.renderCatalogSection(c, "Continue")
}

func (h *AnimeHandler) HandleCatalogTopPickForYou(c *gin.Context) {
	userID := server.CurrentUserID(c)

	data, err := h.svc.GetTopPickForYou(c.Request.Context(), userID)
	if err != nil {
		observability.WarnContext(c.Request.Context(),
			"top_pick_for_you_fetch_failed",
			"anime",
			"",
			map[string]any{
				"user_id": userID,
			},
			err,
		)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, data.Animes)

	data.Section = "TopPickForYou"
	data.Fragment = "top_pick_for_you_section"
	data.WatchlistMap = watchlistMap
	c.HTML(http.StatusOK, "index.gohtml", data)
}

func (h *AnimeHandler) renderCatalogSection(c *gin.Context, section string) {
	userID := server.CurrentUserID(c)
	data, err := h.svc.GetCatalogSection(c.Request.Context(), userID, section)
	if err != nil {
		h.abortSectionFetch(c, "catalog_section_fetch_failed", userID, section, err)
		return
	}

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, data.Animes)

	data.Section = section
	data.Fragment = "catalog_section"
	data.WatchlistMap = watchlistMap
	c.HTML(http.StatusOK, "index.gohtml", data)
}

func (h *AnimeHandler) HandleTopPicks(c *gin.Context) {
	user := server.CurrentUser(c)
	userID := server.CurrentUserID(c)

	data, err := h.svc.GetTopPicksForYou(c.Request.Context(), userID)
	if err != nil {
		observability.WarnContext(c.Request.Context(),
			"top_picks_for_you_fetch_failed",
			"anime",
			"",
			map[string]any{
				"user_id": userID,
			},
			err,
		)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, data.Animes)

	c.HTML(http.StatusOK, "top_picks.gohtml", gin.H{
		"CurrentPath":  "/top-picks",
		"User":         user,
		"Animes":       data.Animes,
		"WatchlistMap": watchlistMap,
	})
}

func (h *AnimeHandler) abortSectionFetch(c *gin.Context, event string, userID string, section string, err error) {
	observability.WarnContext(c.Request.Context(),
		event,
		"anime",
		"",
		map[string]any{
			"section": section,
			"user_id": userID,
		},
		err,
	)
	c.AbortWithStatus(http.StatusInternalServerError)
}
