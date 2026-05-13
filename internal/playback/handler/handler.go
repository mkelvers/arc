package handler

import (
	"log"
	"mal/internal/domain"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type PlaybackHandler struct {
	svc      domain.PlaybackService
	animeSvc domain.AnimeService
}

func NewPlaybackHandler(svc domain.PlaybackService, animeSvc domain.AnimeService) *PlaybackHandler {
	return &PlaybackHandler{svc: svc, animeSvc: animeSvc}
}

func (h *PlaybackHandler) Register(r *gin.Engine) {
	log.Println("Registering playback routes")
	r.GET("/watch/:id", h.HandleWatchPage)
	r.POST("/api/watch-progress", h.HandleSaveProgress)
}

func (h *PlaybackHandler) HandleWatchPage(c *gin.Context) {
	log.Printf("Route /watch/:id triggered for ID: %s", c.Param("id"))
	id, _ := strconv.Atoi(c.Param("id"))
	ep := c.DefaultQuery("ep", "1")
	mode := c.DefaultQuery("mode", "sub")

	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	data, err := h.svc.BuildWatchData(c.Request.Context(), id, []string{}, ep, mode, userID)
	if err != nil {
		log.Printf("BuildWatchData failed for ID %d: %v", id, err)
		// Try to at least get anime info for the error page
		anime, _ := h.animeSvc.GetAnimeByID(c.Request.Context(), id)
		c.HTML(http.StatusOK, "watch.gohtml", gin.H{
			"Error":       err.Error(),
			"Anime":       anime,
			"Episodes":    []domain.EpisodeData{},
			"CurrentPath": c.Request.URL.Path,
			"User":        user,
			"CurrentEpID": ep,
			"WatchData":   map[string]any{"Episodes": []domain.EpisodeData{}, "Providers": []any{}},
		})
		return
	}
	log.Printf("BuildWatchData succeeded for ID %d", id)

	// Merge data from service with handler-specific context
	responseData := gin.H{
		"User":        user,
		"CurrentPath": c.Request.URL.Path,
	}
	for k, v := range data {
		responseData[k] = v
	}

	c.HTML(http.StatusOK, "watch.gohtml", responseData)
	log.Printf("c.HTML finished for ID %d", id)
}

func (h *PlaybackHandler) HandleSaveProgress(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

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
