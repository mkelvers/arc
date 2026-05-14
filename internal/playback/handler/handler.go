package handler

import (
	"fmt"
	"io"
	"mal/internal/domain"
	"mal/pkg/net/proxytransport"
	"maps"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

type PlaybackHandler struct {
	svc      domain.PlaybackService
	animeSvc domain.AnimeService

	proxyClient     *http.Client
	streamingClient *http.Client
	subtitleCache   sync.Map
}

func NewPlaybackHandler(svc domain.PlaybackService, animeSvc domain.AnimeService) *PlaybackHandler {
	return &PlaybackHandler{
		svc:             svc,
		animeSvc:        animeSvc,
		proxyClient:     proxytransport.NewClient(),
		streamingClient: proxytransport.NewStreamingClient(),
	}
}

func (h *PlaybackHandler) Register(r *gin.Engine) {

	r.GET("/anime/:id/watch", h.HandleWatchPage)
	r.POST("/api/watch-progress", h.HandleSaveProgress)
	r.POST("/api/watch-complete", h.HandleWatchComplete)
	r.GET("/api/watch/episode/:animeId/:episode", h.HandleEpisodeData)
	r.GET("/api/watch/thumbnails/:animeId", h.HandleEpisodeThumbnails)
	r.GET("/watch/proxy/stream", h.HandleProxyStream)
	r.GET("/watch/proxy/subtitle", h.HandleProxySubtitle)
}

func (h *PlaybackHandler) HandleWatchPage(c *gin.Context) {
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

	// Merge data from service with handler-specific context
	responseData := gin.H{
		"User":        user,
		"CurrentPath": c.Request.URL.Path,
	}
	maps.Copy(responseData, data)

	c.HTML(http.StatusOK, "watch.gohtml", responseData)
}

// HandleEpisodeData returns the minimal payload needed to advance to the next
// episode without a full page reload (preserves fullscreen).
func (h *PlaybackHandler) HandleEpisodeData(c *gin.Context) {
	animeID, err := strconv.Atoi(c.Param("animeId"))
	if err != nil || animeID <= 0 {
		c.Status(http.StatusBadRequest)
		return
	}

	episode := c.Param("episode")
	if episode == "" {
		c.Status(http.StatusBadRequest)
		return
	}

	mode := c.DefaultQuery("mode", "sub")

	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	data, err := h.svc.BuildWatchData(c.Request.Context(), animeID, []string{}, episode, mode, userID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	watchData, _ := data["WatchData"].(map[string]any)
	if watchData == nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	modeSources := watchData["ModeSources"]
	availableModes, _ := watchData["AvailableModes"].([]string)
	segments := watchData["Segments"]

	// Try to resolve a title for this episode from the episode list.
	episodeTitle := ""
	if eps, ok := watchData["Episodes"].([]domain.EpisodeData); ok {
		epNum, _ := strconv.Atoi(episode)
		for _, e := range eps {
			if e.MalID == epNum {
				episodeTitle = e.Title
				break
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"mode_sources":    modeSources,
		"available_modes": availableModes,
		"segments":        segments,
		"episode_title":   episodeTitle,
	})
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

func (h *PlaybackHandler) HandleWatchComplete(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	var req struct {
		MalID   int64 `json:"mal_id"`
		Episode int   `json:"episode"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	err := h.svc.CompleteAnime(c.Request.Context(), userID, req.MalID)
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
	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}
	if ifRangeHeader := c.GetHeader("If-Range"); ifRangeHeader != "" {
		req.Header.Set("If-Range", ifRangeHeader)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0")

	resp, err := h.streamingClient.Do(req)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	for k, v := range resp.Header {
		c.Header(k, v[0])
	}
	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, resp.Body)
}

type cachedSubtitle struct {
	data        []byte
	contentType string
}

func (h *PlaybackHandler) HandleProxySubtitle(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.Status(http.StatusBadRequest)
		return
	}

	targetURL, referer, err := h.svc.ResolveProxyToken(token)
	if err != nil {
		c.Status(http.StatusForbidden)
		return
	}

	if cached, ok := h.subtitleCache.Load(targetURL); ok {
		entry := cached.(cachedSubtitle)
		c.Data(http.StatusOK, entry.contentType, entry.data)
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

	resp, err := h.proxyClient.Do(req)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = detectSubtitleType(targetURL)
	}

	h.subtitleCache.Store(targetURL, cachedSubtitle{data: body, contentType: contentType})

	c.Data(http.StatusOK, contentType, body)
}

func detectSubtitleType(url string) string {
	lower := strings.ToLower(url)
	switch {
	case strings.Contains(lower, ".vtt"):
		return "text/vtt"
	case strings.Contains(lower, ".srt"):
		return "text/plain; charset=utf-8"
	case strings.Contains(lower, ".ass") || strings.Contains(lower, ".ssa"):
		return "text/plain; charset=utf-8"
	default:
		return "text/plain; charset=utf-8"
	}
}
