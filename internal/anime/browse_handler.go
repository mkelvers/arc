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
	"time"

	"github.com/gin-gonic/gin"
)

type producerItem struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
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

	genresList, err := h.svc.GetGenres(c.Request.Context())
	if err != nil {
		observability.WarnContext(c.Request.Context(),
			"genres_fetch_failed",
			"anime",
			"",
			map[string]any{"q": query.q, "type": query.animeType, "status": query.status},
			err,
		)
	}
	browseData := browseTemplateData(query, studioName, genresList, animes, user, watchlistMap, res.HasNextPage)

	if c.GetHeader("HX-Request") == "true" {
		browseData["_fragment"] = "browse_content"
		c.HTML(http.StatusOK, "browse.gohtml", browseData)
		return
	}

	c.HTML(http.StatusOK, "browse.gohtml", browseData)
}

type quickSearchResult struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	Year        int    `json:"year"`
	Image       string `json:"image"`
	InWatchlist bool   `json:"in_watchlist"`
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
