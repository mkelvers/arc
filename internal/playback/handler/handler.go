// Package handler provides the HTTP handler for playback endpoints.
package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"mal/internal/domain"
	"mal/internal/observability"
	"mal/internal/playback/proxytarget"
	"mal/internal/server"

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
		proxyClient:     proxytarget.NewClient(60 * time.Second),
		streamingClient: proxytarget.NewStreamingClient(),
		subtitleCache:   newSubtitleCache(10*time.Minute, 256),
	}
}

func (h *PlaybackHandler) Register(r *gin.Engine) {
	r.GET("/anime/:id/watch", h.HandleWatchPage)
	r.POST("/api/watch-progress", h.HandleSaveProgress)
	r.POST("/api/watch-complete", h.HandleWatchComplete)
	r.GET("/api/watch/episode/:animeId/:episode", h.HandleEpisodeData)
	r.POST("/api/watch/segments", h.HandleUpsertSkipSegment)
	r.GET("/api/watch/episodes/:animeId/metadata", h.HandleEpisodeMetadata)
	r.GET("/watch/proxy/stream", h.HandleProxyStream)
	r.GET("/watch/proxy/subtitle", h.HandleProxySubtitle)
}

func (h *PlaybackHandler) HandleWatchPage(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}
	ep := c.DefaultQuery("ep", "1")
	mode := c.DefaultQuery("mode", "sub")

	user := server.CurrentUser(c)
	userID := server.CurrentUserID(c)

	data, err := h.svc.BuildWatchData(c.Request.Context(), id, []string{}, ep, mode, userID)
	if err != nil {
		if data.Anime.MalID == 0 && data.WatchData.MalID == 0 && len(data.Episodes) == 0 {
			anime, fetchErr := h.animeSvc.GetAnimeByID(c.Request.Context(), id)
			if fetchErr != nil {
				fmt.Printf("error fetching anime for error page: %v\n", fetchErr)
			}
			data = domain.WatchPageData{
				Anime:       anime,
				CurrentEpID: ep,
				WatchData: domain.WatchData{
					MalID:          id,
					Title:          anime.DisplayTitle(),
					CurrentEpisode: ep,
					Episodes:       []domain.CanonicalEpisode{},
					Providers:      []domain.ProviderData{},
					ModeSources:    map[string]domain.ModeSource{},
					AvailableModes: []string{},
					Airing:         anime.Airing,
				},
			}
		}

		observability.LogContext(
			c.Request.Context(),
			observability.LogLevelError,
			"watch_page_build_failed",
			"playback",
			"",
			map[string]any{"anime_id": id, "episode": ep, "mode": mode, "user_id": userID, "request_path": c.Request.URL.Path},
			err,
		)

		data.Error = "failed to load playback data"
		data.User = user
		data.CurrentPath = c.Request.URL.Path

		c.HTML(http.StatusOK, "watch.gohtml", data)
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
	epNum, err := strconv.Atoi(episode)
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid episode")
		return
	}
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
		server.RespondError(
			c,
			http.StatusBadRequest,
			"skip_segment_upsert_failed",
			"playback",
			"invalid skip segment",
			map[string]any{"mal_id": req.MalID, "episode": req.Episode, "skip_type": req.SkipType, "user_id": userID},
			err,
		)
		return
	}

	c.Status(http.StatusOK)
}

func (h *PlaybackHandler) HandleEpisodeMetadata(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("animeId"))
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	allEpisodes, err := h.animeSvc.GetAllEpisodes(c.Request.Context(), id)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"episode_metadata_load_failed",
			"playback",
			"failed to load episode metadata",
			map[string]any{"anime_id": id},
			err,
		)
		return
	}

	anime, fetchErr := h.animeSvc.GetAnimeByID(c.Request.Context(), id)
	if fetchErr != nil {
		fmt.Printf("error fetching anime for thumbnail fill: %v\n", fetchErr)
	}
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
