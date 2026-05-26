package handler

import (
	"context"
	"fmt"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
	"mal/internal/server"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type AnimeHandler struct {
	svc          domain.AnimeService
	watchlistSvc domain.WatchlistService
}

func NewAnimeHandler(svc domain.AnimeService, watchlistSvc domain.WatchlistService) *AnimeHandler {
	return &AnimeHandler{
		svc:          svc,
		watchlistSvc: watchlistSvc,
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

func (h *AnimeHandler) Register(r *gin.Engine) {

	r.GET("/", h.HandleCatalog)
	r.GET("/api/catalog/airing", h.HandleCatalogAiring)
	r.GET("/api/catalog/popular", h.HandleCatalogPopular)
	r.GET("/api/catalog/continue", h.HandleCatalogContinue)
	r.GET("/discover", h.HandleDiscover)
	r.GET("/api/discover/trending", h.HandleDiscoverTrending)
	r.GET("/api/discover/upcoming", h.HandleDiscoverUpcoming)
	r.GET("/api/discover/top", h.HandleDiscoverTop)
	r.GET("/api/discover/for-you", h.HandleDiscoverForYou)
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

func (h *AnimeHandler) HandleProducers(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid page")
		return
	}
	if page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid limit")
		return
	}
	if limit < 1 {
		limit = 12
	}
	if limit > 12 {
		limit = 12
	}

	res, err := h.svc.GetProducers(c.Request.Context(), q, page, limit)
	if err != nil {
		observability.Warn(
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
		if strings.Contains(c.GetHeader("Accept"), "text/html") {
			c.HTML(http.StatusOK, "browse.gohtml", gin.H{
				"_fragment":   "studio_dropdown_items",
				"StudioItems": []any{},
				"HasNextPage": false,
				"Page":        page,
				"NextPage":    page + 1,
				"Query":       q,
				"Limit":       limit,
			})
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

	type item struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}

	items := make([]item, 0, len(res.Items))
	for _, p := range res.Items {
		name := jikan.ProducerListEntryName(p)
		if p.MalID <= 0 || name == "" {
			continue
		}
		items = append(items, item{ID: p.MalID, Name: name})
	}

	if strings.Contains(c.GetHeader("Accept"), "text/html") {
		c.HTML(http.StatusOK, "browse.gohtml", gin.H{
			"_fragment":   "studio_dropdown_items",
			"StudioItems": items,
			"HasNextPage": res.HasNextPage,
			"Page":        page,
			"NextPage":    page + 1,
			"Query":       q,
			"Limit":       limit,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":       items,
		"hasNextPage": res.HasNextPage,
		"nextPage":    page + 1,
	})
}

func (h *AnimeHandler) HandleCatalog(c *gin.Context) {
	user, _ := c.Get("User")

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

func (h *AnimeHandler) renderCatalogSection(c *gin.Context, section string) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}
	data, err := h.svc.GetCatalogSection(c.Request.Context(), userID, section)
	if err != nil {
		observability.Warn(
			"catalog_section_fetch_failed",
			"anime",
			"",
			map[string]any{
				"section": section,
				"user_id": userID,
			},
			err,
		)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, data.Animes)

	data.Section = section
	data.Fragment = "catalog_section"
	data.WatchlistMap = watchlistMap
	c.HTML(http.StatusOK, "index.gohtml", data)
}

func (h *AnimeHandler) HandleDiscover(c *gin.Context) {
	user, _ := c.Get("User")
	c.HTML(http.StatusOK, "discover.gohtml", gin.H{
		"CurrentPath": "/discover",
		"User":        user,
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

func (h *AnimeHandler) HandleDiscoverForYou(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	data, err := h.svc.GetDiscoverForYou(c.Request.Context(), userID)
	if err != nil {
		observability.Warn(
			"discover_for_you_fetch_failed",
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

	data.Section = "ForYou"
	data.Fragment = "discover_row"
	data.WatchlistMap = watchlistMap
	c.HTML(http.StatusOK, "discover.gohtml", data)
}

func (h *AnimeHandler) renderDiscoverSection(c *gin.Context, section string) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}
	data, err := h.svc.GetDiscoverSection(c.Request.Context(), userID, section)
	if err != nil {
		observability.Warn(
			"discover_section_fetch_failed",
			"anime",
			"",
			map[string]any{
				"section": section,
				"user_id": userID,
			},
			err,
		)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, data.Animes)

	data.Section = section
	data.Fragment = "discover_section"
	data.WatchlistMap = watchlistMap
	c.HTML(http.StatusOK, "discover.gohtml", data)
}

func (h *AnimeHandler) HandleSchedule(c *gin.Context) {
	user, _ := c.Get("User")
	c.HTML(http.StatusOK, "schedule.gohtml", gin.H{
		"CurrentPath": "/schedule",
		"User":        user,
	})
}

func (h *AnimeHandler) HandleScheduleSection(c *gin.Context) {
	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	animes, err := h.svc.GetAiringSchedule(c.Request.Context(), userID)
	if err != nil {
		observability.Warn(
			"schedule_fetch_failed",
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

	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, animes)

	c.HTML(http.StatusOK, "schedule.gohtml", gin.H{
		"_fragment":    "schedule_section",
		"Animes":       animes,
		"WatchlistMap": watchlistMap,
	})
}

func (h *AnimeHandler) HandleBrowse(c *gin.Context) {
	q := c.Query("q")
	animeType := c.Query("type")
	status := c.Query("status")
	orderBy := c.Query("order_by")
	sort := c.Query("sort")
	sfw := c.Query("sfw") != "false"
	studioID := 0
	if raw := strings.TrimSpace(c.Query("studio")); raw != "" {
		id, err := strconv.Atoi(raw)
		if err != nil || id < 0 {
			server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid studio id")
			return
		}
		studioID = id
	}

	var genres []int
	for _, g := range c.QueryArray("genres") {
		id, err := strconv.Atoi(g)
		if err != nil {
			server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid genre id")
			return
		}
		if id > 0 {
			genres = append(genres, id)
		}
	}

	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid page")
		return
	}
	if page < 1 {
		page = 1
	}

	res, err := h.svc.SearchAdvanced(c.Request.Context(), q, animeType, status, orderBy, sort, genres, studioID, sfw, page, 24)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"browse_search_failed",
			"anime",
			"failed to load browse results",
			map[string]any{
				"q":        q,
				"type":     animeType,
				"status":   status,
				"order_by": orderBy,
				"sort":     sort,
				"studio":   studioID,
				"sfw":      sfw,
				"page":     page,
			},
			err,
		)
		return
	}

	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}
	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, res.Animes)

	studioName := ""
	if studioID > 0 {
		name, err := h.svc.GetProducerNameByID(c.Request.Context(), studioID)
		if err == nil {
			studioName = name
		}
	}

	if c.GetHeader("HX-Request") == "true" && page > 1 {
		c.HTML(http.StatusOK, "browse.gohtml", gin.H{
			"_fragment":    "anime_card_scroll",
			"Animes":       res.Animes,
			"NextPage":     page + 1,
			"HasNextPage":  res.HasNextPage,
			"Query":        q,
			"Type":         animeType,
			"Status":       status,
			"OrderBy":      orderBy,
			"Sort":         sort,
			"Genres":       genres,
			"Studio":       studioID,
			"StudioName":   studioName,
			"SFW":          sfw,
			"WatchlistMap": watchlistMap,
		})
		return
	}

	genresList, _ := h.svc.GetGenres(c.Request.Context())

	if c.GetHeader("HX-Request") == "true" {
		c.HTML(http.StatusOK, "browse.gohtml", gin.H{
			"_fragment":    "browse_content",
			"CurrentPath":  "/browse",
			"Query":        q,
			"Type":         animeType,
			"Status":       status,
			"OrderBy":      orderBy,
			"Sort":         sort,
			"Genres":       genres,
			"Studio":       studioID,
			"StudioName":   studioName,
			"SFW":          sfw,
			"GenresList":   genresList,
			"Animes":       res.Animes,
			"HasNextPage":  res.HasNextPage,
			"NextPage":     page + 1,
			"User":         user,
			"WatchlistMap": watchlistMap,
		})
		return
	}

	c.HTML(http.StatusOK, "browse.gohtml", gin.H{
		"CurrentPath":  "/browse",
		"Query":        q,
		"Type":         animeType,
		"Status":       status,
		"OrderBy":      orderBy,
		"Sort":         sort,
		"Genres":       genres,
		"Studio":       studioID,
		"StudioName":   studioName,
		"SFW":          sfw,
		"GenresList":   genresList,
		"Animes":       res.Animes,
		"HasNextPage":  res.HasNextPage,
		"NextPage":     page + 1,
		"User":         user,
		"WatchlistMap": watchlistMap,
	})
}

func (h *AnimeHandler) HandleAnimeDetails(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	section := c.Query("section")
	if section != "" && c.GetHeader("HX-Request") == "true" {
		sectionCtx, cancel := context.WithTimeout(c.Request.Context(), 4*time.Second)
		defer cancel()

		var data any
		var tplName string
		var err error
		switch section {
		case "characters":
			data, err = h.svc.GetCharacters(sectionCtx, id)
			tplName = "anime_characters"
		case "recommendations":
			data, err = h.svc.GetRecommendations(sectionCtx, id)
			tplName = "anime_recommendations"

		case "statistics":
			data, err = h.svc.GetStatistics(sectionCtx, id)
			tplName = "anime_statistics"
		case "themes":
			data, err = h.svc.GetThemes(sectionCtx, id)
			tplName = "anime_themes"
		}

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
			c.Status(http.StatusNoContent)
			return
		}

		c.HTML(http.StatusOK, "anime.gohtml", gin.H{
			"_fragment": tplName,
			"Items":     data,
		})
		return
	}

	anime, err := h.svc.GetAnimeByID(c.Request.Context(), id)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	user, _ := c.Get("User")
	status := ""
	var watchlistIDs []int64
	ep := 0
	var cwSeconds float64
	if u, ok := user.(*domain.User); ok {
		entry, err := h.watchlistSvc.GetWatchListEntry(c.Request.Context(), u.ID, int64(id))
		if err == nil {
			status = entry.Status
			watchlistIDs = []int64{entry.AnimeID}
		}

		cwEntry, err := h.watchlistSvc.GetContinueWatchingEntry(c.Request.Context(), u.ID, int64(id))
		if err == nil && cwEntry.CurrentEpisode.Valid {
			ep = int(cwEntry.CurrentEpisode.Int64)
			cwSeconds = cwEntry.CurrentTimeSeconds
		}
	}

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"Anime":                anime,
		"CurrentPath":          fmt.Sprintf("/anime/%d", id),
		"User":                 user,
		"Status":               status,
		"WatchlistIDs":         watchlistIDs,
		"ContinueWatchingEp":   ep,
		"ContinueWatchingTime": cwSeconds,
	})
}

func (h *AnimeHandler) HandleHTMLWatchOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Query("animeId"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}

	relationsCtx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	relations, err := h.svc.GetRelations(relationsCtx, id)
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
		c.Status(http.StatusNoContent)
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

	user, _ := c.Get("User")
	userID := ""
	if u, ok := user.(*domain.User); ok {
		userID = u.ID
	}
	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, res.Animes)

	type quickSearchResult struct {
		ID          int    `json:"id"`
		Title       string `json:"title"`
		Type        string `json:"type"`
		Year        int    `json:"year"`
		Image       string `json:"image"`
		InWatchlist bool   `json:"in_watchlist"`
	}

	output := make([]quickSearchResult, len(res.Animes))
	for i, anime := range res.Animes {
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

type commandPaletteItem struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Label    string `json:"label"`
	Subtitle string `json:"subtitle"`
	Href     string `json:"href"`
	Image    string `json:"image,omitempty"`
	Icon     string `json:"icon,omitempty"`
}

func (h *AnimeHandler) HandleCommandPalette(c *gin.Context) {
	user, _ := c.Get("User")
	u, ok := user.(*domain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	query := strings.TrimSpace(c.Query("q"))
	items := make([]commandPaletteItem, 0, 12)

	if query != "" {
		items = append(items, commandPaletteItem{
			ID:       "search:" + strings.ToLower(query),
			Type:     "search",
			Label:    fmt.Sprintf("Search anime for %q", query),
			Subtitle: "Browse",
			Href:     "/browse?q=" + url.QueryEscape(query),
			Icon:     "search",
		})

		if len(query) >= 2 {
			items = append(items, h.commandPaletteAnimeResults(c, query)...)
		}

		items = append(items, h.commandPaletteNavigationItems(query)...)
		items = append(items, h.commandPaletteContinueItems(c, u.ID, query)...)
		items = append(items, h.commandPalettePersonalItems(c, u.ID, query)...)
		c.JSON(http.StatusOK, items)
		return
	}

	items = append(items, h.commandPaletteContinueItems(c, u.ID, query)...)
	items = append(items, h.commandPaletteNavigationItems(query)...)
	items = append(items, h.commandPalettePersonalItems(c, u.ID, query)...)
	c.JSON(http.StatusOK, items)
}

func (h *AnimeHandler) commandPaletteNavigationItems(query string) []commandPaletteItem {
	all := []commandPaletteItem{
		{ID: "nav:discover", Type: "navigation", Label: "Go to Discover", Subtitle: "Navigation", Href: "/discover", Icon: "compass"},
		{ID: "nav:watchlist", Type: "navigation", Label: "Go to Watchlist", Subtitle: "Navigation", Href: "/watchlist", Icon: "bookmark"},
		{ID: "nav:popular", Type: "navigation", Label: "Browse popular", Subtitle: "Browse", Href: "/browse?order_by=popularity&sort=desc", Icon: "trending"},
		{ID: "nav:airing", Type: "navigation", Label: "Currently airing", Subtitle: "Browse", Href: "/browse?status=airing&order_by=popularity&sort=desc", Icon: "play"},
	}
	if query == "" {
		return all
	}

	filtered := make([]commandPaletteItem, 0, len(all))
	for _, item := range all {
		if commandPaletteMatches(query, item.Label, item.Subtitle) {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func (h *AnimeHandler) commandPaletteAnimeResults(c *gin.Context, query string) []commandPaletteItem {
	searchCtx, cancel := context.WithTimeout(c.Request.Context(), 800*time.Millisecond)
	defer cancel()

	res, err := h.svc.SearchAdvanced(searchCtx, query, "", "", "", "", nil, 0, true, 1, 5)
	if err != nil {
		return nil
	}

	items := make([]commandPaletteItem, 0, len(res.Animes))
	for _, anime := range res.Animes {
		items = append(items, commandPaletteItem{
			ID:       fmt.Sprintf("anime:%d", anime.MalID),
			Type:     "anime",
			Label:    anime.DisplayTitle(),
			Subtitle: strings.TrimSpace("Anime " + anime.Type),
			Href:     fmt.Sprintf("/anime/%d", anime.MalID),
			Image:    anime.ImageURL(),
		})
	}
	return items
}

func (h *AnimeHandler) commandPalettePersonalItems(c *gin.Context, userID string, query string) []commandPaletteItem {
	items := make([]commandPaletteItem, 0, 5)

	watchlist, err := h.watchlistSvc.GetCommandPaletteWatchlist(c.Request.Context(), userID, query, 5)
	if err != nil {
		return items
	}

	for _, entry := range watchlist {
		title := watchlistTitle(entry)
		items = append(items, commandPaletteItem{
			ID:       fmt.Sprintf("watchlist:%d", entry.AnimeID),
			Type:     "watchlist",
			Label:    title,
			Subtitle: watchlistStatusLabel(entry.Status),
			Href:     fmt.Sprintf("/anime/%d", entry.AnimeID),
			Image:    entry.ImageUrl,
		})
		if len(items) >= 5 {
			return items
		}
	}

	return items
}

func (h *AnimeHandler) commandPaletteContinueItems(c *gin.Context, userID string, query string) []commandPaletteItem {
	items := make([]commandPaletteItem, 0, 5)

	rows, err := h.watchlistSvc.GetCommandPaletteContinueWatching(c.Request.Context(), userID, query, 5)
	if err != nil {
		return items
	}

	for _, row := range rows {
		title := continueWatchingTitle(row)
		episode := ""
		href := fmt.Sprintf("/anime/%d/watch", row.AnimeID)
		if row.CurrentEpisode.Valid {
			episode = fmt.Sprintf(" episode %d", row.CurrentEpisode.Int64)
			href = fmt.Sprintf("%s?ep=%d", href, row.CurrentEpisode.Int64)
		}
		items = append(items, commandPaletteItem{
			ID:       fmt.Sprintf("continue:%d", row.AnimeID),
			Type:     "continue",
			Label:    "Continue watching " + title,
			Subtitle: "Resume" + episode,
			Href:     href,
			Image:    row.ImageUrl,
		})
		if len(items) >= 5 {
			return items
		}
	}

	return items
}

func commandPaletteMatches(query string, values ...string) bool {
	needle := strings.ToLower(strings.TrimSpace(query))
	for _, value := range values {
		if strings.Contains(strings.ToLower(value), needle) {
			return true
		}
	}
	return false
}

func continueWatchingTitle(row db.GetContinueWatchingEntriesRow) string {
	if row.TitleEnglish.Valid && row.TitleEnglish.String != "" {
		return row.TitleEnglish.String
	}
	return row.TitleOriginal
}

func watchlistTitle(row domain.UserWatchListRow) string {
	if row.TitleEnglish.Valid && row.TitleEnglish.String != "" {
		return row.TitleEnglish.String
	}
	return row.TitleOriginal
}

func watchlistStatusLabel(status string) string {
	switch status {
	case "watching":
		return "Watching"
	case "plan_to_watch":
		return "Plan to Watch"
	default:
		return "Watchlist"
	}
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

	user, _ := c.Get("User")
	inWatchlist := false
	if u, ok := user.(*domain.User); ok {
		watchlistMap := h.watchlistMapForIDs(c.Request.Context(), u.ID, []int64{int64(anime.MalID)})
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

	user, _ := c.Get("User")

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
