package anime

import (
	"context"
	"fmt"
	"mal/integrations/jikan"
	"mal/internal/domain"
	"mal/internal/observability"
	"mal/internal/server"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	animeSectionTimeout = 12 * time.Second
	watchOrderTimeout   = 15 * time.Second
	audioLookupTimeout  = 8 * time.Second
)

type AnimeHandler struct {
	svc          Service
	watchlistSvc domain.WatchlistService
	episodeSvc   domain.EpisodeService

	scheduleCacheMu sync.Mutex
	scheduleCache   map[string]cachedWeekSchedule
}

type producerItem struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type Service interface {
	domain.AnimeCatalogService
	domain.AnimeDiscoverService
	domain.AnimeSearchService
	domain.AnimeDetailsService
	WarmDetailSections(id int)
}

func NewAnimeHandler(svc Service, watchlistSvc domain.WatchlistService, episodeSvc domain.EpisodeService) *AnimeHandler {
	return &AnimeHandler{
		svc:           svc,
		watchlistSvc:  watchlistSvc,
		episodeSvc:    episodeSvc,
		scheduleCache: map[string]cachedWeekSchedule{},
	}
}

func (h *AnimeHandler) watchlistMapForAnimes(ctx context.Context, userID string, animes []domain.Anime) map[int64]bool {
	animeIDs := make([]int64, 0, len(animes))
	for _, anime := range animes {
		if anime.MalID > 0 {
			animeIDs = append(animeIDs, int64(anime.MalID))
		}
	}
	return h.watchlistMapForIDs(ctx, userID, animeIDs)
}

func (h *AnimeHandler) watchlistMapForIDs(ctx context.Context, userID string, animeIDs []int64) map[int64]bool {
	if userID == "" || len(animeIDs) == 0 {
		return map[int64]bool{}
	}

	watchlistMap, err := h.watchlistSvc.GetWatchlistMap(ctx, userID, animeIDs)
	if err != nil {
		return map[int64]bool{}
	}
	return watchlistMap
}

func animeAudioAvailabilityLabel(episodes []domain.CanonicalEpisode) string {
	hasKnownSub := false
	for _, episode := range episodes {
		if episode.HasDub {
			return "Dub available"
		}
		if episode.HasSub || episode.SubOnly {
			hasKnownSub = true
		}
	}
	if hasKnownSub {
		return "Subtitled only"
	}
	return ""
}

func (h *AnimeHandler) animeAudioAvailability(ctx context.Context, anime domain.Anime) string {
	if h.episodeSvc == nil {
		return ""
	}

	audioCtx, cancel := context.WithTimeout(ctx, audioLookupTimeout)
	defer cancel()

	episodeList, err := h.episodeSvc.GetCanonicalEpisodes(audioCtx, anime, true)
	if err != nil {
		observability.Warn(
			"anime_audio_availability_fetch_failed",
			"anime",
			"",
			map[string]any{
				"anime_id": anime.MalID,
			},
			err,
		)
		return ""
	}
	if episodeList.Source != "AllAnime" {
		return ""
	}

	return animeAudioAvailabilityLabel(episodeList.Episodes)
}

func (h *AnimeHandler) Register(r *gin.Engine) {
	r.GET("/", h.HandleCatalog)
	r.GET("/api/catalog/airing", h.HandleCatalogAiring)
	r.GET("/api/catalog/popular", h.HandleCatalogPopular)
	r.GET("/api/catalog/continue", h.HandleCatalogContinue)
	r.GET("/api/catalog/top-pick", h.HandleCatalogTopPickForYou)
	r.GET("/discover", h.HandleDiscover)
	r.GET("/discover/top-picks", h.HandleDiscoverTopPicksForYou)
	r.GET("/api/discover/trending", h.HandleDiscoverTrending)
	r.GET("/api/discover/upcoming", h.HandleDiscoverUpcoming)
	r.GET("/api/discover/top", h.HandleDiscoverTop)
	r.GET("/schedule", h.HandleSchedule)
	r.GET("/api/schedule", h.HandleScheduleSection)
	r.GET("/browse", h.HandleBrowse)
	r.GET("/anime/:id", h.HandleAnimeDetails)
	r.GET("/anime/:id/reviews", h.HandleAnimeReviews)
	r.GET("/api/watch-order", h.HandleHTMLWatchOrder)
	r.GET("/api/search-quick", h.HandleQuickSearch)
	r.GET("/api/command-palette", h.HandleCommandPalette)
	r.GET("/api/jikan/random/anime", h.HandleRandomAnime)
	r.GET("/api/jikan/producers", h.HandleProducers)
}

func producerQueryParams(c *gin.Context) (string, int, int, error) {
	q := strings.TrimSpace(c.Query("q"))

	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil {
		return "", 0, 0, fmt.Errorf("invalid page")
	}
	if page < 1 {
		page = 1
	}

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if err != nil {
		return "", 0, 0, fmt.Errorf("invalid limit")
	}
	if limit < 1 || limit > 12 {
		limit = 12
	}

	return q, page, limit, nil
}

func producerItems(entries []jikan.ProducerListEntry) []producerItem {
	items := make([]producerItem, 0, len(entries))
	for _, producer := range entries {
		name := jikan.ProducerListEntryName(producer)
		if producer.MalID <= 0 || name == "" {
			continue
		}
		items = append(items, producerItem{ID: producer.MalID, Name: name})
	}
	return items
}

func producerHTMLPayload(items []producerItem, hasNextPage bool, page int, q string, limit int) gin.H {
	return gin.H{
		"_fragment":   "studio_dropdown_items",
		"StudioItems": items,
		"HasNextPage": hasNextPage,
		"Page":        page,
		"NextPage":    page + 1,
		"Query":       q,
		"Limit":       limit,
	}
}

func requestWantsHTML(c *gin.Context) bool {
	return strings.Contains(c.GetHeader("Accept"), "text/html")
}

func (h *AnimeHandler) HandleProducers(c *gin.Context) {
	q, page, limit, err := producerQueryParams(c)
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, err.Error())
		return
	}

	res, err := h.svc.GetProducers(c.Request.Context(), q, page, limit)
	if err != nil {
		observability.WarnContext(c.Request.Context(),
			"producers_fetch_failed",
			"anime",
			"",
			map[string]any{
				"q":     q,
				"page":  page,
				"limit": limit,
			},
			err,
		)
		if requestWantsHTML(c) {
			c.HTML(http.StatusOK, "browse.gohtml", producerHTMLPayload([]producerItem{}, false, page, q, limit))
			return
		}

		server.RespondError(
			c,
			http.StatusInternalServerError,
			"producers_fetch_failed",
			"anime",
			"failed to load producers",
			map[string]any{"q": q, "page": page, "limit": limit},
			err,
		)
		return
	}

	items := producerItems(res.Items)

	if requestWantsHTML(c) {
		c.HTML(http.StatusOK, "browse.gohtml", producerHTMLPayload(items, res.HasNextPage, page, q, limit))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":       items,
		"hasNextPage": res.HasNextPage,
		"nextPage":    page + 1,
	})
}

func (h *AnimeHandler) HandleCatalog(c *gin.Context) {
	user := server.CurrentUser(c)

	c.HTML(http.StatusOK, "index.gohtml", gin.H{
		"CurrentPath":  "/",
		"User":         user,
		"WatchlistMap": map[int64]bool{},
	})
}

func (h *AnimeHandler) HandleCatalogAiring(c *gin.Context) {
	h.renderCatalogSection(c, "Airing")
}

func (h *AnimeHandler) HandleCatalogPopular(c *gin.Context) {
	h.renderCatalogSection(c, "Popular")
}

func (h *AnimeHandler) HandleCatalogContinue(c *gin.Context) {
	h.renderCatalogSection(c, "Continue")
}

func (h *AnimeHandler) HandleCatalogTopPickForYou(c *gin.Context) {
	userID := server.CurrentUserID(c)

	data, err := h.svc.GetTopPickForYou(c.Request.Context(), userID)
	if err != nil {
		observability.WarnContext(c.Request.Context(),
			"top_pick_for_you_fetch_failed",
			"anime",
			"",
			map[string]any{
				"user_id": userID,
			},
			err,
		)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, data.Animes)

	data.Section = "TopPickForYou"
	data.Fragment = "top_pick_for_you_section"
	data.WatchlistMap = watchlistMap
	c.HTML(http.StatusOK, "index.gohtml", data)
}

func (h *AnimeHandler) renderCatalogSection(c *gin.Context, section string) {
	userID := server.CurrentUserID(c)
	data, err := h.svc.GetCatalogSection(c.Request.Context(), userID, section)
	if err != nil {
		h.abortSectionFetch(c, "catalog_section_fetch_failed", userID, section, err)
		return
	}

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, data.Animes)

	data.Section = section
	data.Fragment = "catalog_section"
	data.WatchlistMap = watchlistMap
	c.HTML(http.StatusOK, "index.gohtml", data)
}

func (h *AnimeHandler) HandleDiscover(c *gin.Context) {
	user := server.CurrentUser(c)
	c.HTML(http.StatusOK, "discover.gohtml", gin.H{
		"CurrentPath": "/discover",
		"User":        user,
	})
}

func (h *AnimeHandler) HandleDiscoverTopPicksForYou(c *gin.Context) {
	user := server.CurrentUser(c)
	userID := server.CurrentUserID(c)

	data, err := h.svc.GetTopPicksForYou(c.Request.Context(), userID)
	if err != nil {
		observability.WarnContext(c.Request.Context(),
			"top_picks_for_you_fetch_failed",
			"anime",
			"",
			map[string]any{
				"user_id": userID,
			},
			err,
		)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, data.Animes)

	c.HTML(http.StatusOK, "discover.gohtml", gin.H{
		"_fragment":    "",
		"CurrentPath":  "/discover",
		"User":         user,
		"Animes":       data.Animes,
		"WatchlistMap": watchlistMap,
		"IsTopPicks":   true,
	})
}

func (h *AnimeHandler) HandleDiscoverTrending(c *gin.Context) {
	h.renderDiscoverSection(c, "Trending")
}

func (h *AnimeHandler) HandleDiscoverUpcoming(c *gin.Context) {
	h.renderDiscoverSection(c, "Upcoming")
}

func (h *AnimeHandler) HandleDiscoverTop(c *gin.Context) {
	h.renderDiscoverSection(c, "Top")
}

func (h *AnimeHandler) renderDiscoverSection(c *gin.Context, section string) {
	userID := server.CurrentUserID(c)
	data, err := h.svc.GetDiscoverSection(c.Request.Context(), userID, section)
	if err != nil {
		h.abortSectionFetch(c, "discover_section_fetch_failed", userID, section, err)
		return
	}

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, data.Animes)

	data.Section = section
	data.Fragment = "discover_section"
	data.WatchlistMap = watchlistMap
	c.HTML(http.StatusOK, "discover.gohtml", data)
}

func (h *AnimeHandler) abortSectionFetch(c *gin.Context, event string, userID string, section string, err error) {
	observability.WarnContext(c.Request.Context(),
		event,
		"anime",
		"",
		map[string]any{
			"section": section,
			"user_id": userID,
		},
		err,
	)
	c.AbortWithStatus(http.StatusInternalServerError)
}

func (h *AnimeHandler) HandleSchedule(c *gin.Context) {
	user := server.CurrentUser(c)
	year, week := parseYearWeek(c)
	c.HTML(http.StatusOK, "schedule.gohtml", gin.H{
		"CurrentPath":  "/schedule",
		"User":         user,
		"ScheduleYear": year,
		"ScheduleWeek": week,
	})
}

func (h *AnimeHandler) HandleScheduleSection(c *gin.Context) {
	year, week := parseYearWeek(c)
	timezone := scheduleTimezone(c)

	schedule, err := h.getCachedAnimeScheduleWeek(c.Request.Context(), year, week, timezone)
	if err != nil {
		prevYear, prevWeek := adjacentISOWeek(year, week, -1)
		nextYear, nextWeek := adjacentISOWeek(year, week, 1)
		observability.WarnContext(c.Request.Context(),
			"animeschedule_fetch_failed",
			"anime",
			"",
			map[string]any{
				"year":     year,
				"week":     week,
				"timezone": timezone,
			},
			err,
		)
		c.HTML(http.StatusOK, "schedule.gohtml", gin.H{
			"_fragment":     "schedule_section_scraped",
			"ScheduleDays":  []any{},
			"ScheduleYear":  year,
			"ScheduleWeek":  week,
			"PrevYear":      prevYear,
			"PrevWeek":      prevWeek,
			"NextYear":      nextYear,
			"NextWeek":      nextWeek,
			"ScheduleError": true,
		})
		return
	}

	days := buildScheduleDays(schedule, schedule.Year, schedule.Week)
	prevYear, prevWeek := adjacentISOWeek(schedule.Year, schedule.Week, -1)
	nextYear, nextWeek := adjacentISOWeek(schedule.Year, schedule.Week, 1)

	c.HTML(http.StatusOK, "schedule.gohtml", gin.H{
		"_fragment":    "schedule_section_scraped",
		"ScheduleDays": days,
		"ScheduleYear": schedule.Year,
		"ScheduleWeek": schedule.Week,
		"PrevYear":     prevYear,
		"PrevWeek":     prevWeek,
		"NextYear":     nextYear,
		"NextWeek":     nextWeek,
	})
}

type browseQuery struct {
	q         string
	animeType string
	status    string
	orderBy   string
	sort      string
	sfw       bool
	studioID  int
	genres    []int
	page      int
}

func parseBrowseQuery(c *gin.Context) (browseQuery, error) {
	studioID := 0
	if raw := strings.TrimSpace(c.Query("studio")); raw != "" {
		id, err := strconv.Atoi(raw)
		if err != nil || id < 0 {
			return browseQuery{}, fmt.Errorf("invalid studio id")
		}
		studioID = id
	}

	genres := make([]int, 0, len(c.QueryArray("genres")))
	for _, g := range c.QueryArray("genres") {
		id, err := strconv.Atoi(g)
		if err != nil {
			return browseQuery{}, fmt.Errorf("invalid genre id")
		}
		if id > 0 {
			genres = append(genres, id)
		}
	}

	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil {
		return browseQuery{}, fmt.Errorf("invalid page")
	}
	if page < 1 {
		page = 1
	}

	return browseQuery{
		q:         c.Query("q"),
		animeType: c.Query("type"),
		status:    c.Query("status"),
		orderBy:   c.Query("order_by"),
		sort:      c.Query("sort"),
		sfw:       c.Query("sfw") != "false",
		studioID:  studioID,
		genres:    genres,
		page:      page,
	}, nil
}

func browseStudioName(ctx context.Context, svc Service, studioID int) string {
	if studioID <= 0 {
		return ""
	}

	name, err := svc.GetProducerNameByID(ctx, studioID)
	if err != nil {
		return ""
	}

	return name
}

func browseTemplateData(
	q browseQuery,
	studioName string,
	genresList []domain.Genre,
	animes []domain.Anime,
	user any,
	watchlistMap map[int64]bool,
	hasNextPage bool,
) gin.H {
	return gin.H{
		"CurrentPath":  "/browse",
		"Query":        q.q,
		"Type":         q.animeType,
		"Status":       q.status,
		"OrderBy":      q.orderBy,
		"Sort":         q.sort,
		"Genres":       q.genres,
		"Studio":       q.studioID,
		"StudioName":   studioName,
		"SFW":          q.sfw,
		"GenresList":   genresList,
		"Animes":       animes,
		"HasNextPage":  hasNextPage,
		"NextPage":     q.page + 1,
		"User":         user,
		"WatchlistMap": watchlistMap,
	}
}

func (h *AnimeHandler) searchBrowse(ctx context.Context, query browseQuery) (jikan.SearchResult, error) {
	return h.svc.SearchAdvanced(
		ctx,
		query.q,
		query.animeType,
		query.status,
		query.orderBy,
		query.sort,
		query.genres,
		query.studioID,
		query.sfw,
		query.page,
		24,
	)
}

func browseScrollData(
	query browseQuery,
	studioName string,
	animes []domain.Anime,
	watchlistMap map[int64]bool,
	hasNextPage bool,
) gin.H {
	return gin.H{
		"_fragment":    "anime_card_scroll",
		"Animes":       animes,
		"NextPage":     query.page + 1,
		"HasNextPage":  hasNextPage,
		"Query":        query.q,
		"Type":         query.animeType,
		"Status":       query.status,
		"OrderBy":      query.orderBy,
		"Sort":         query.sort,
		"Genres":       query.genres,
		"Studio":       query.studioID,
		"StudioName":   studioName,
		"SFW":          query.sfw,
		"WatchlistMap": watchlistMap,
	}
}

func (h *AnimeHandler) respondBrowseSearchError(c *gin.Context, query browseQuery, err error) {
	server.RespondError(
		c,
		http.StatusInternalServerError,
		"browse_search_failed",
		"anime",
		"failed to load browse results",
		map[string]any{
			"q":        query.q,
			"type":     query.animeType,
			"status":   query.status,
			"order_by": query.orderBy,
			"sort":     query.sort,
			"studio":   query.studioID,
			"sfw":      query.sfw,
			"page":     query.page,
		},
		err,
	)
}

func (h *AnimeHandler) HandleBrowse(c *gin.Context) {
	query, err := parseBrowseQuery(c)
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, err.Error())
		return
	}

	res, err := h.searchBrowse(c.Request.Context(), query)
	if err != nil {
		h.respondBrowseSearchError(c, query, err)
		return
	}

	user := server.CurrentUser(c)
	userID := server.CurrentUserID(c)
	animes := wrapAnimes(res.Animes)
	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, animes)
	studioName := browseStudioName(c.Request.Context(), h.svc, query.studioID)

	if c.GetHeader("HX-Request") == "true" && query.page > 1 {
		c.HTML(http.StatusOK, "browse.gohtml", browseScrollData(query, studioName, animes, watchlistMap, res.HasNextPage))
		return
	}

	genresList, _ := h.svc.GetGenres(c.Request.Context())
	browseData := browseTemplateData(query, studioName, genresList, animes, user, watchlistMap, res.HasNextPage)

	if c.GetHeader("HX-Request") == "true" {
		browseData["_fragment"] = "browse_content"
		c.HTML(http.StatusOK, "browse.gohtml", browseData)
		return
	}

	c.HTML(http.StatusOK, "browse.gohtml", browseData)
}

func (h *AnimeHandler) HandleAnimeDetails(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	section := c.Query("section")
	if section != "" && c.GetHeader("HX-Request") == "true" {
		h.handleAnimeDetailsSection(c, id, section)
		return
	}

	anime, err := h.svc.GetAnimeByID(c.Request.Context(), id)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	h.svc.WarmDetailSections(id)

	user := server.CurrentUser(c)
	status := ""
	var watchlistIDs []int64
	ep := 0
	var cwSeconds float64
	if user != nil {
		entry, err := h.watchlistSvc.GetWatchListEntry(c.Request.Context(), user.ID, int64(id))
		if err == nil {
			status = entry.Status
			watchlistIDs = []int64{entry.AnimeID}
		}

		cwEntry, err := h.watchlistSvc.GetContinueWatchingEntry(c.Request.Context(), user.ID, int64(id))
		if err == nil && cwEntry.CurrentEpisode.Valid {
			ep = int(cwEntry.CurrentEpisode.Int64)
			cwSeconds = cwEntry.CurrentTimeSeconds
		}
	}

	audioAvailability := h.animeAudioAvailability(c.Request.Context(), anime)

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"Anime":                anime,
		"AudioAvailability":    audioAvailability,
		"CurrentPath":          fmt.Sprintf("/anime/%d", id),
		"User":                 user,
		"Status":               status,
		"WatchlistIDs":         watchlistIDs,
		"ContinueWatchingEp":   ep,
		"ContinueWatchingTime": cwSeconds,
	})
}

func (h *AnimeHandler) handleAnimeDetailsSection(c *gin.Context, id int, section string) {
	sectionCtx, cancel := context.WithTimeout(c.Request.Context(), animeSectionTimeout)
	defer cancel()

	data, tplName, err := h.loadAnimeDetailsSection(sectionCtx, id, section)
	if err != nil {
		observability.Warn(
			"anime_section_fetch_failed",
			"anime",
			"",
			map[string]any{
				"section":  section,
				"anime_id": id,
			},
			err,
		)
		if section == "recommendations" {
			c.HTML(http.StatusOK, "anime.gohtml", gin.H{
				"_fragment": "anime_recommendations_loading",
				"AnimeID":   id,
			})
			return
		}
		c.Status(http.StatusNoContent)
		return
	}

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"_fragment": tplName,
		"Items":     data,
	})
}

func (h *AnimeHandler) loadAnimeDetailsSection(ctx context.Context, id int, section string) (any, string, error) {
	switch section {
	case "characters":
		data, err := h.svc.GetCharacters(ctx, id)
		return data, "anime_characters", err
	case "recommendations":
		data, err := h.svc.GetRecommendations(ctx, id)
		return data, "anime_recommendations", err
	case "statistics":
		data, err := h.svc.GetStatistics(ctx, id)
		return data, "anime_statistics", err
	case "themes":
		data, err := h.svc.GetThemes(ctx, id)
		return data, "anime_themes", err
	default:
		return nil, "", nil
	}
}

func (h *AnimeHandler) HandleHTMLWatchOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Query("animeId"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	userID := server.CurrentUserID(c)
	mode := jikan.NormalizeWatchOrderMode(c.Query("mode"))

	relationsCtx, cancel := context.WithTimeout(c.Request.Context(), watchOrderTimeout)
	defer cancel()

	relations, err := h.svc.GetRelations(relationsCtx, id, mode)
	if err != nil {
		observability.Warn(
			"relations_fetch_failed",
			"anime",
			"",
			map[string]any{
				"anime_id": id,
			},
			err,
		)
		c.HTML(http.StatusOK, "anime.gohtml", gin.H{
			"_fragment": "watch_order_loading",
			"AnimeID":   id,
			"Mode":      string(mode),
		})
		return
	}

	relationAnimeIDs := make([]int64, 0, len(relations))
	for _, relation := range relations {
		if relation.Anime.MalID > 0 {
			relationAnimeIDs = append(relationAnimeIDs, int64(relation.Anime.MalID))
		}
	}
	watchlistMap := h.watchlistMapForIDs(c.Request.Context(), userID, relationAnimeIDs)

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"_fragment":    "watch_order",
		"Relations":    relations,
		"AnimeID":      id,
		"Mode":         string(mode),
		"WatchlistMap": watchlistMap,
	})
}

func (h *AnimeHandler) HandleQuickSearch(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusOK, []any{})
		return
	}

	res, err := h.svc.SearchAdvanced(c.Request.Context(), query, "", "", "", "", nil, 0, true, 1, 5)
	if err != nil {
		c.JSON(http.StatusOK, []any{})
		return
	}

	userID := server.CurrentUserID(c)
	animes := wrapAnimes(res.Animes)
	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, animes)

	type quickSearchResult struct {
		ID          int    `json:"id"`
		Title       string `json:"title"`
		Type        string `json:"type"`
		Year        int    `json:"year"`
		Image       string `json:"image"`
		InWatchlist bool   `json:"in_watchlist"`
	}

	output := make([]quickSearchResult, len(animes))
	for i, anime := range animes {
		output[i] = quickSearchResult{
			ID:          anime.MalID,
			Title:       anime.DisplayTitle(),
			Type:        anime.Type,
			Year:        anime.Year,
			Image:       anime.ImageURL(),
			InWatchlist: watchlistMap[int64(anime.MalID)],
		}
	}
	c.JSON(http.StatusOK, output)
}

func (h *AnimeHandler) HandleRandomAnime(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	anime, err := h.svc.GetRandomAnime(ctx)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"random_anime_fetch_failed",
			"anime",
			"failed to fetch random anime",
			nil,
			err,
		)
		return
	}
	if anime.MalID == 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadGateway, "random anime unavailable")
		return
	}

	inWatchlist := false
	userID := server.CurrentUserID(c)
	if userID != "" {
		watchlistMap := h.watchlistMapForIDs(c.Request.Context(), userID, []int64{int64(anime.MalID)})
		inWatchlist = watchlistMap[int64(anime.MalID)]
	}

	c.JSON(http.StatusOK, gin.H{
		"data":         anime,
		"in_watchlist": inWatchlist,
	})
}

func (h *AnimeHandler) HandleAnimeReviews(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid page")
		return
	}
	if page < 1 {
		page = 1
	}

	reviews, hasNextPage, err := h.svc.GetReviews(c.Request.Context(), id, page)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"anime_reviews_fetch_failed",
			"anime",
			"failed to load reviews",
			map[string]any{"anime_id": id, "page": page},
			err,
		)
		return
	}

	user := server.CurrentUser(c)

	if c.GetHeader("HX-Request") == "true" && page > 1 {
		c.HTML(http.StatusOK, "reviews.gohtml", gin.H{
			"_fragment":   "review_cards",
			"Reviews":     reviews,
			"NextPage":    page + 1,
			"HasNextPage": hasNextPage,
			"AnimeID":     id,
		})
		return
	}

	c.HTML(http.StatusOK, "reviews.gohtml", gin.H{
		"CurrentPath": fmt.Sprintf("/anime/%d/reviews", id),
		"Reviews":     reviews,
		"NextPage":    page + 1,
		"HasNextPage": hasNextPage,
		"AnimeID":     id,
		"User":        user,
	})
}
