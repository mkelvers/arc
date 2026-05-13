package handler

import (
	"mal/internal/domain"
	"net/http"
	"strconv"

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
	r.GET("/watchlist", h.HandleGetWatchlist)
}

func (h *WatchlistHandler) HandleUpdateWatchlist(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	animeID, _ := strconv.ParseInt(c.PostForm("anime_id"), 10, 64)
	status := c.PostForm("status")

	if animeID <= 0 || status == "" {
		c.Status(http.StatusBadRequest)
		return
	}

	err := h.svc.UpdateEntry(c.Request.Context(), userID, animeID, status)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	c.Status(http.StatusOK)
}

func (h *WatchlistHandler) HandleDeleteWatchlist(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	animeID, _ := strconv.ParseInt(c.Param("id"), 10, 64)

	if animeID <= 0 {
		c.Status(http.StatusBadRequest)
		return
	}

	err := h.svc.RemoveEntry(c.Request.Context(), userID, animeID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	c.Status(http.StatusOK)
}

func (h *WatchlistHandler) HandleDeleteContinueWatching(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	animeID, _ := strconv.ParseInt(c.Param("id"), 10, 64)

	if animeID <= 0 {
		c.Status(http.StatusBadRequest)
		return
	}

	err := h.svc.DeleteContinueWatching(c.Request.Context(), userID, animeID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	c.Status(http.StatusOK)
}

func (h *WatchlistHandler) HandleGetWatchlist(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	entries, err := h.svc.GetWatchlist(c.Request.Context(), userID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	c.HTML(http.StatusOK, "watchlist.gohtml", gin.H{
		"Entries":     entries,
		"CurrentPath": "/watchlist",
		"User":        user,
	})
}
