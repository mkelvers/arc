package anime

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"mal/internal/server"

	"github.com/gin-gonic/gin"
)

const franchiseTimeout = 15 * time.Second

func (h *AnimeHandler) HandleAnimeFranchise(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), franchiseTimeout)
	defer cancel()
	entries, err := h.svc.GetFranchise(ctx, id)
	if err != nil {
		slog.Warn("anime_franchise_fetch_failed", "component", "anime", "fields", map[string]any{"anime_id": id}, "error", err)
	}

	includeExtras := c.Query("extras") == "1"
	visibleEntries, hasExtras := franchiseEntriesForDisplay(entries, includeExtras)
	animes := make([]int64, 0, len(visibleEntries))
	for _, entry := range visibleEntries {
		animes = append(animes, int64(entry.Anime.MalID))
	}
	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"_fragment":     "anime_franchise",
		"AnimeID":       id,
		"Entries":       visibleEntries,
		"HasExtras":     hasExtras,
		"IncludeExtras": includeExtras,
		"WatchlistMap":  h.watchlistMapForIDs(c.Request.Context(), server.CurrentUserID(c), animes),
	})
}
