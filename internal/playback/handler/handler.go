package handler

import (
	"fmt"
	"io"
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
	r.GET("/anime/:id/watch", h.HandleWatchPage)
	r.POST("/api/watch-progress", h.HandleSaveProgress)
	r.GET("/api/watch/thumbnails/:animeId", h.HandleEpisodeThumbnails)
	r.GET("/watch/proxy/stream", h.HandleProxyStream)
}

func (h *PlaybackHandler) HandleWatchPage(c *gin.Context) {
	log.Printf("Route /anime/:id/watch triggered for ID: %s", c.Param("id"))
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

func (h *PlaybackHandler) HandleEpisodeThumbnails(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("animeId"))
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	allEpisodes, err := h.animeSvc.GetAllEpisodes(c.Request.Context(), id)
	if err != nil {
		log.Printf("failed to fetch thumbnails/episodes: %v", err)
	}

	anime, _ := h.animeSvc.GetAnimeByID(c.Request.Context(), id)
	if anime.Episodes > 0 && anime.Episodes > len(allEpisodes) {
		epMap := make(map[int]domain.EpisodeData)
		for _, ep := range allEpisodes {
			epMap[ep.MalID] = ep
		}
		var filled []domain.EpisodeData
		for i := 1; i <= anime.Episodes; i++ {
			if ep, ok := epMap[i]; ok {
				filled = append(filled, ep)
			} else {
				filled = append(filled, domain.EpisodeData{
					MalID: i,
					Title: fmt.Sprintf("Episode %d", i),
				})
			}
		}
		allEpisodes = filled
	}

	type Result struct {
		MalID int    `json:"mal_id"`
		Title string `json:"title"`
	}

	results := make([]Result, len(allEpisodes))
	for i, ep := range allEpisodes {
		results[i] = Result{
			MalID: ep.MalID,
			Title: ep.Title,
		}
	}

	c.JSON(http.StatusOK, results)
}

func (h *PlaybackHandler) HandleProxyStream(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.Status(http.StatusBadRequest)
		return
	}

	targetURL, referer, err := h.svc.ResolveProxyToken(token)
	if err != nil {
		log.Printf("proxy token error: %v", err)
		c.Status(http.StatusForbidden)
		return
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("proxy fetch error: %v", err)
		c.Status(http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, v := range resp.Header {
		c.Header(k, v[0])
	}
	c.Status(resp.StatusCode)
	io.Copy(c.Writer, resp.Body)
}
