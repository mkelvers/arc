package anime

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
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

	selectedExtras := selectedFranchiseExtras(c)
	visibleEntries, extraOptions := franchiseEntriesForDisplay(entries, selectedExtras)
	animes := make([]int64, 0, len(visibleEntries))
	for _, entry := range visibleEntries {
		animes = append(animes, int64(entry.Anime.MalID))
	}
	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"_fragment":    "anime_franchise",
		"AnimeID":      id,
		"Entries":      visibleEntries,
		"ExtraOptions": extraOptions,
		"WatchlistMap": h.watchlistMapForIDs(c.Request.Context(), server.CurrentUserID(c), animes),
	})
}

func selectedFranchiseExtras(c *gin.Context) map[string]bool {
	selected := make(map[string]bool)
	if c.Query("extras") == "1" {
		selected["OVA"] = true
		selected["ONA"] = true
		selected["SPECIAL"] = true
		selected["TV SPECIAL"] = true
		selected["MUSIC"] = true
	}
	for _, value := range c.QueryArray("types") {
		value = strings.ToUpper(strings.TrimSpace(value))
		if isVisibleFranchiseType(value) && value != "TV" && value != "MOVIE" {
			selected[value] = true
		}
	}
	return selected
}
