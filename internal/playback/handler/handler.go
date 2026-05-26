package handler

import (
	"fmt"
	"io"
	"mal/internal/domain"
	"mal/internal/server"
	"mal/pkg/net/limits"
	"mal/pkg/net/proxytransport"
	"mal/pkg/net/useragent"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type PlaybackHandler struct {
	svc      domain.PlaybackService
	animeSvc domain.AnimeService

	proxyClient     *http.Client
	streamingClient *http.Client
	subtitleCache   *subtitleCache
}

func NewPlaybackHandler(svc domain.PlaybackService, animeSvc domain.AnimeService) *PlaybackHandler {
	return &PlaybackHandler{
		svc:             svc,
		animeSvc:        animeSvc,
		proxyClient:     proxytransport.NewClient(),
		streamingClient: proxytransport.NewStreamingClient(),
		subtitleCache:   newSubtitleCache(10*time.Minute, 256),
	}
}

func (h *PlaybackHandler) Register(r *gin.Engine) {

	r.GET("/anime/:id/watch", h.HandleWatchPage)
	r.POST("/api/watch-progress", h.HandleSaveProgress)
	r.POST("/api/watch-complete", h.HandleWatchComplete)
	r.GET("/api/watch/episode/:animeId/:episode", h.HandleEpisodeData)
	r.POST("/api/watch/segments", h.HandleUpsertSkipSegment)
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
		c.HTML(http.StatusOK, "watch.gohtml", domain.WatchPageData{
			Error:       err.Error(),
			Anime:       anime,
			Episodes:    []domain.CanonicalEpisode{},
			CurrentPath: c.Request.URL.Path,
			User:        currentUser(user),
			CurrentEpID: ep,
			WatchData: domain.WatchData{
				Episodes:  []domain.CanonicalEpisode{},
				Providers: []domain.ProviderData{},
			},
		})
		return
	}

	data.User = currentUser(user)
	data.CurrentPath = c.Request.URL.Path

	c.HTML(http.StatusOK, "watch.gohtml", data)
}

// HandleEpisodeData returns the minimal payload needed to advance to the next
// episode without a full page reload (preserves fullscreen).
func (h *PlaybackHandler) HandleEpisodeData(c *gin.Context) {
	animeID, err := strconv.Atoi(c.Param("animeId"))
	if err != nil || animeID <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	episode := c.Param("episode")
	if episode == "" {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "missing episode")
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
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"watch_episode_data_build_failed",
			"playback",
			"failed to load episode data",
			map[string]any{"anime_id": animeID, "episode": episode, "mode": mode, "user_id": userID},
			err,
		)
		return
	}

	watchData := data.WatchData

	// Try to resolve a title for this episode from the episode list.
	episodeTitle := ""
	epNum, _ := strconv.Atoi(episode)
	for _, e := range watchData.Episodes {
		if e.Number == epNum {
			episodeTitle = e.Title
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"mode_sources":       watchData.ModeSources,
		"available_modes":    watchData.AvailableModes,
		"initial_mode":       watchData.InitialMode,
		"start_time_seconds": watchData.StartTimeSeconds,
		"segments":           watchData.Segments,
		"episode_title":      episodeTitle,
		"mode_switched_from": watchData.ModeSwitchedFrom,
	})
}

func currentUser(value any) *domain.User {
	if user, ok := value.(*domain.User); ok {
		return user
	}
	return nil
}

func (h *PlaybackHandler) HandleSaveProgress(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}
	if userID == "" {
		// Avoid spamming 500s for anonymous playback; progress is user-scoped.
		server.RespondHTMLOrJSONError(c, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		MalID       int64   `json:"mal_id"`
		Episode     int     `json:"episode"`
		TimeSeconds float64 `json:"time_seconds"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.svc.SaveProgress(c.Request.Context(), userID, req.MalID, req.Episode, req.TimeSeconds)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"watch_progress_save_failed",
			"playback",
			"failed to save progress",
			map[string]any{"mal_id": req.MalID, "episode": req.Episode, "user_id": userID},
			err,
		)
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
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.svc.CompleteAnime(c.Request.Context(), userID, req.MalID)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"watch_complete_failed",
			"playback",
			"failed to complete anime",
			map[string]any{"mal_id": req.MalID, "user_id": userID},
			err,
		)
		return
	}

	c.Status(http.StatusOK)
}

func (h *PlaybackHandler) HandleUpsertSkipSegment(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "login required"})
		return
	}

	var req struct {
		MalID     int64   `json:"mal_id"`
		Episode   int     `json:"episode"`
		SkipType  string  `json:"skip_type"` // 'op' or 'ed' (also accepts 'opening'/'ending')
		StartTime float64 `json:"start_time"`
		EndTime   float64 `json:"end_time"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if err := h.svc.UpsertSkipSegmentOverride(c.Request.Context(), userID, req.MalID, req.Episode, req.SkipType, req.StartTime, req.EndTime); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
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
	req.Header.Set("User-Agent", useragent.Firefox121)

	resp, err := h.streamingClient.Do(req)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	copyProxyHeaders(c.Writer.Header(), resp.Header)
	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, resp.Body)
}

func copyProxyHeaders(dst http.Header, src http.Header) {
	// Skip hop-by-hop headers; see RFC 7230 section 6.1.
	// We intentionally preserve multi-value headers by copying the full slice.
	for k, v := range src {
		switch http.CanonicalHeaderKey(k) {
		case "Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade":
			continue
		}
		// Copy the slice to avoid sharing memory with src.
		copied := make([]string, len(v))
		copy(copied, v)
		dst[k] = copied
	}
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

	if data, contentType, ok := h.subtitleCache.Get(targetURL, time.Now()); ok {
		c.Data(http.StatusOK, contentType, data)
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
	req.Header.Set("User-Agent", useragent.Firefox121)

	resp, err := h.proxyClient.Do(req)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, limits.MiB2))
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = detectSubtitleType(targetURL)
	}

	h.subtitleCache.Set(targetURL, body, contentType, time.Now())

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
