package handler

import (
	"mal/internal/domain"
	"mal/internal/server"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type PlaybackHandler struct {
	svc domain.PlaybackService
}

func NewPlaybackHandler(svc domain.PlaybackService) *PlaybackHandler {
	return &PlaybackHandler{svc: svc}
}

func (h *PlaybackHandler) Register(r *gin.Engine) {
	r.GET("/watch/:id", h.HandleWatchPage)
	r.POST("/api/watch-progress", h.HandleSaveProgress)
}

func (h *PlaybackHandler) HandleWatchPage(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	ep := c.DefaultQuery("ep", "1")
	mode := c.DefaultQuery("mode", "sub")

	userID := "" // TODO: get from auth context
	data, err := h.svc.BuildWatchData(c.Request.Context(), id, []string{}, ep, mode, userID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	c.HTML(http.StatusOK, "watch.gohtml", gin.H{
		"WatchData":   data,
		"CurrentPath": c.Request.URL.Path,
	})
}

func (h *PlaybackHandler) HandleSaveProgress(c *gin.Context) {
	userID := "" // TODO: get from auth context
	var req struct {
		MalID       int64   `json:"mal_id"`
		Episode     int     `json:"episode"`
		TimeSeconds float64 `json:"time_seconds"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	err := h.svc.SaveProgress(c.Request.Context(), userID, req.MalID, req.Episode, req.TimeSeconds)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	c.Status(http.StatusOK)
}
