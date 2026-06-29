// Package watchlist manages user watchlist entries and related operations.
package watchlist

import (
	"mal/internal/domain"
	"mal/internal/server"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type WatchlistHandler struct {
	svc domain.WatchlistService
}

func NewWatchlistHandler(svc domain.WatchlistService) *WatchlistHandler {
	return &WatchlistHandler{svc: svc}
}

func (h *WatchlistHandler) Register(r *gin.Engine) {
	r.POST("/api/watchlist", h.HandleUpdateWatchlist)
	r.DELETE("/api/watchlist/:id", h.HandleDeleteWatchlist)
	r.DELETE("/api/continue-watching/:id", h.HandleDeleteContinueWatching)
	r.GET("/api/public/users/:userID/watchlist", h.HandleGetPublicWatchlist)
	r.GET("/watchlist", h.HandleGetWatchlist)
}

func (h *WatchlistHandler) HandleUpdateWatchlist(c *gin.Context) {
	userID := server.CurrentUserID(c)

	var body struct {
		AnimeID int64  `json:"animeId"`
		Status  string `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.AnimeID <= 0 || body.Status == "" {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.svc.UpdateEntry(c.Request.Context(), userID, body.AnimeID, body.Status)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"watchlist_update_failed",
			"watchlist",
			"failed to update watchlist entry",
			map[string]any{"user_id": userID, "anime_id": body.AnimeID, "status": body.Status},
			err,
		)
		return
	}

	c.Status(http.StatusOK)
}

func (h *WatchlistHandler) HandleDeleteWatchlist(c *gin.Context) {
	userID := server.CurrentUserID(c)

	animeID, ok := parseAnimeIDParam(c)
	if !ok {
		return
	}

	err := h.svc.RemoveEntry(c.Request.Context(), userID, animeID)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"watchlist_remove_failed",
			"watchlist",
			"failed to remove watchlist entry",
			map[string]any{"user_id": userID, "anime_id": animeID},
			err,
		)
		return
	}

	c.Status(http.StatusOK)
}

func (h *WatchlistHandler) HandleDeleteContinueWatching(c *gin.Context) {
	userID := server.CurrentUserID(c)

	animeID, ok := parseAnimeIDParam(c)
	if !ok {
		return
	}

	err := h.svc.DeleteContinueWatching(c.Request.Context(), userID, animeID)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"continue_watching_delete_failed",
			"watchlist",
			"failed to delete continue watching entry",
			map[string]any{"user_id": userID, "anime_id": animeID},
			err,
		)
		return
	}

	c.Status(http.StatusOK)
}

func parseAnimeIDParam(c *gin.Context) (int64, bool) {
	animeID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || animeID <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return 0, false
	}

	return animeID, true
}

func (h *WatchlistHandler) HandleGetWatchlist(c *gin.Context) {
	user := server.CurrentUser(c)
	userID := server.CurrentUserID(c)

	entries, err := h.svc.GetWatchlist(c.Request.Context(), userID)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"watchlist_load_failed",
			"watchlist",
			"failed to load watchlist",
			map[string]any{"user_id": userID},
			err,
		)
		return
	}

	c.HTML(http.StatusOK, "watchlist.gohtml", gin.H{
		"AllEntries":  entries,
		"CurrentPath": "/watchlist",
		"User":        user,
	})
}

func (h *WatchlistHandler) HandleGetPublicWatchlist(c *gin.Context) {
	userID := strings.TrimSpace(c.Param("userID"))
	if userID == "" {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid user id")
		return
	}

	entries, err := h.svc.GetWatchlist(c.Request.Context(), userID)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"public_watchlist_load_failed",
			"watchlist",
			"failed to load public watchlist",
			map[string]any{"user_id": userID},
			err,
		)
		return
	}

	c.Header("Cache-Control", "no-store")
	if c.Query("download") == "1" {
		c.Header("Content-Disposition", `attachment; filename="watchlist-`+safeFilenamePart(userID)+`.json"`)
	}
	c.JSON(http.StatusOK, newPublicWatchlist(userID, entries, time.Now().UTC()))
}

func safeFilenamePart(value string) string {
	const allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
	var filename strings.Builder
	for _, char := range value {
		if strings.ContainsRune(allowed, char) {
			filename.WriteRune(char)
		}
	}
	if filename.Len() == 0 {
		return "user"
	}
	return filename.String()
}
