// Package handler provides the HTTP handler for playback endpoints.
package handler

import (
	"context"
	"fmt"
	"io"
	"mal/internal/domain"
	"mal/internal/server"
	netutil "mal/pkg/net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type PlaybackHandler struct {
	svc      domain.PlaybackService
	animeSvc domain.AnimePlaybackService

	proxyClient     *http.Client
	streamingClient *http.Client
	subtitleCache   *subtitleCache
}

func NewPlaybackHandler(svc domain.PlaybackService, animeSvc domain.AnimePlaybackService) *PlaybackHandler {
	return &PlaybackHandler{
		svc:             svc,
		animeSvc:        animeSvc,
		proxyClient:     netutil.NewClient(),
		streamingClient: netutil.NewStreamingClient(),
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

	user := server.CurrentUser(c)
	userID := server.CurrentUserID(c)

	data, err := h.svc.BuildWatchData(c.Request.Context(), id, []string{}, ep, mode, userID)
	if err != nil {
		anime, _ := h.animeSvc.GetAnimeByID(c.Request.Context(), id)
		c.HTML(http.StatusOK, "watch.gohtml", domain.WatchPageData{
			Error:       err.Error(),
			Anime:       anime,
			Episodes:    []domain.CanonicalEpisode{},
			CurrentPath: c.Request.URL.Path,
			User:        user,
			CurrentEpID: ep,
			WatchData: domain.WatchData{
				Episodes:  []domain.CanonicalEpisode{},
				Providers: []domain.ProviderData{},
			},
		})
		return
	}

	data.User = user
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

	userID := server.CurrentUserID(c)

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

func (h *PlaybackHandler) HandleSaveProgress(c *gin.Context) {
	userID := server.CurrentUserID(c)
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
	userID := server.CurrentUserID(c)
	if userID == "" {
		server.RespondHTMLOrJSONError(c, http.StatusUnauthorized, "unauthorized")
		return
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
	userID := server.CurrentUserID(c)
	if userID == "" {
		server.RespondHTMLOrJSONError(c, http.StatusUnauthorized, "unauthorized")
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
	targetURL, referer, ok := h.resolveProxyRequestTarget(c, "stream")
	if !ok {
		return
	}

	req, err := newProxyRequest(c.Request.Context(), targetURL, referer)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}
	if ifRangeHeader := c.GetHeader("If-Range"); ifRangeHeader != "" {
		req.Header.Set("If-Range", ifRangeHeader)
	}

	resp, err := h.streamingClient.Do(req)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	if isHLSPlaylistResponse(targetURL, resp.Header) {
		body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.MiB2))
		if err != nil {
			c.Status(http.StatusBadGateway)
			return
		}
		rewritten, err := h.rewriteHLSPlaylist(string(body), targetURL, referer)
		if err != nil {
			c.Status(http.StatusBadGateway)
			return
		}
		copyProxyHeaders(c.Writer.Header(), resp.Header)
		c.Writer.Header().Del("Content-Length")
		c.Data(resp.StatusCode, "application/vnd.apple.mpegurl", []byte(rewritten))
		return
	}

	copyProxyHeaders(c.Writer.Header(), resp.Header)
	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, resp.Body)
}

func isHLSPlaylistResponse(targetURL string, headers http.Header) bool {
	contentType := strings.ToLower(headers.Get("Content-Type"))
	if strings.Contains(contentType, "mpegurl") || strings.Contains(contentType, "x-mpegurl") {
		return true
	}

	parsed, err := url.Parse(targetURL)
	if err != nil {
		return strings.Contains(strings.ToLower(targetURL), ".m3u8")
	}
	return strings.Contains(strings.ToLower(parsed.Path), ".m3u8")
}

func (h *PlaybackHandler) rewriteHLSPlaylist(body string, playlistURL string, referer string) (string, error) {
	baseURL, err := url.Parse(playlistURL)
	if err != nil {
		return "", err
	}

	lines := strings.SplitAfter(body, "\n")
	var out strings.Builder
	for _, line := range lines {
		lineBody := strings.TrimSuffix(line, "\n")
		newline := ""
		if strings.HasSuffix(line, "\n") {
			newline = "\n"
			lineBody = strings.TrimSuffix(lineBody, "\r")
			if strings.HasSuffix(line, "\r\n") {
				newline = "\r\n"
			}
		}

		trimmed := strings.TrimSpace(lineBody)
		rewritten := lineBody
		if trimmed != "" {
			if strings.HasPrefix(trimmed, "#") {
				rewritten, err = h.rewriteHLSQuotedURIs(lineBody, baseURL, referer)
			} else {
				rewritten, err = h.proxyPlaylistURI(trimmed, baseURL, referer)
			}
			if err != nil {
				return "", err
			}
		}
		out.WriteString(rewritten)
		out.WriteString(newline)
	}

	return out.String(), nil
}

func (h *PlaybackHandler) rewriteHLSQuotedURIs(line string, baseURL *url.URL, referer string) (string, error) {
	const marker = `URI="`
	var out strings.Builder
	remaining := line
	for {
		idx := strings.Index(remaining, marker)
		if idx < 0 {
			out.WriteString(remaining)
			return out.String(), nil
		}
		out.WriteString(remaining[:idx+len(marker)])
		remaining = remaining[idx+len(marker):]
		end := strings.Index(remaining, `"`)
		if end < 0 {
			out.WriteString(remaining)
			return out.String(), nil
		}
		proxied, err := h.proxyPlaylistURI(remaining[:end], baseURL, referer)
		if err != nil {
			return "", err
		}
		out.WriteString(proxied)
		remaining = remaining[end:]
	}
}

func (h *PlaybackHandler) proxyPlaylistURI(rawURI string, baseURL *url.URL, referer string) (string, error) {
	target, err := baseURL.Parse(rawURI)
	if err != nil {
		return "", err
	}
	token, err := h.svc.SignProxyToken(target.String(), referer, "stream")
	if err != nil {
		return "", err
	}
	params := url.Values{}
	params.Set("token", token)
	return "/watch/proxy/stream?" + params.Encode(), nil
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

func (h *PlaybackHandler) resolveProxyRequestTarget(c *gin.Context, scope string) (string, string, bool) {
	token := c.Query("token")
	if token == "" {
		c.Status(http.StatusBadRequest)
		return "", "", false
	}

	targetURL, referer, err := h.svc.ResolveProxyToken(token, scope)
	if err != nil {
		c.Status(http.StatusForbidden)
		return "", "", false
	}

	return targetURL, referer, true
}

func newProxyRequest(ctx context.Context, targetURL string, referer string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}

	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	req.Header.Set("User-Agent", netutil.Firefox121)

	return req, nil
}

func (h *PlaybackHandler) HandleProxySubtitle(c *gin.Context) {
	targetURL, referer, ok := h.resolveProxyRequestTarget(c, "subtitle")
	if !ok {
		return
	}

	if data, contentType, ok := h.subtitleCache.Get(targetURL, time.Now()); ok {
		c.Data(http.StatusOK, contentType, data)
		return
	}

	req, err := newProxyRequest(c.Request.Context(), targetURL, referer)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}

	resp, err := h.proxyClient.Do(req)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.MiB2))
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
