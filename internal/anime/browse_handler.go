package anime

import (
	"context"
	"fmt"
	"mal/integrations/metadata"
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
		if err != nil {
			return browseQuery{}, fmt.Errorf("invalid studio id %q: %w", raw, err)
		}
		if id < 0 {
			return browseQuery{}, fmt.Errorf("invalid studio id %d", id)
		}
		studioID = id
	}

	genres := make([]int, 0, len(c.QueryArray("genres")))
	for _, g := range c.QueryArray("genres") {
		id, err := strconv.Atoi(g)
		if err != nil {
			return browseQuery{}, fmt.Errorf("invalid genre id %q: %w", g, err)
		}
		if id > 0 {
			genres = append(genres, id)
		}
	}

	rawPage := c.DefaultQuery("page", "1")
	page, err := strconv.Atoi(rawPage)
	if err != nil {
		return browseQuery{}, fmt.Errorf("invalid page %q: %w", rawPage, err)
	}
	if page < 1 {
		page = 1
	}

	orderBy, sort := browseSort(c.Query("order_by"), c.Query("sort"))

	return browseQuery{
		q:         c.Query("q"),
		animeType: c.Query("type"),
		status:    c.Query("status"),
		orderBy:   orderBy,
		sort:      sort,
		sfw:       c.Query("sfw") != "false",
		studioID:  studioID,
		genres:    genres,
		page:      page,
	}, nil
}

func browseSort(orderBy, sort string) (string, string) {
	if orderBy != "score" {
		orderBy = "popularity"
	}
	if sort != "asc" {
		sort = "desc"
	}
	return orderBy, sort
}

func canonicalBrowseURL(rawURL *url.URL) (string, bool) {
	if rawURL == nil {
		return "", false
	}

	query := rawURL.Query()
	if _, exists := query["sfw"]; exists {
		return "", false
	}

	query.Set("sfw", "true")
	encoded := query.Encode()
	if encoded == "" {
		return rawURL.Path, true
	}

	return rawURL.Path + "?" + encoded, true
}

type browsePageData struct {
	query        browseQuery
	studioName   string
	genresList   []domain.Genre
	animes       []domain.Anime
	user         any
	watchlistMap map[int64]bool
	hasNextPage  bool
}

func browseTemplateData(data browsePageData) gin.H {
	return gin.H{
		"CurrentPath":  "/browse",
		"Query":        data.query.q,
		"Type":         data.query.animeType,
		"Status":       data.query.status,
		"OrderBy":      data.query.orderBy,
		"Sort":         data.query.sort,
		"Genres":       data.query.genres,
		"Studio":       data.query.studioID,
		"StudioName":   data.studioName,
		"SFW":          data.query.sfw,
		"GenresList":   data.genresList,
		"Animes":       data.animes,
		"HasNextPage":  data.hasNextPage,
		"NextPage":     data.query.page + 1,
		"User":         data.user,
		"WatchlistMap": data.watchlistMap,
	}
}

func (h *AnimeHandler) searchBrowse(ctx context.Context, query browseQuery) (metadata.SearchResult, error) {
	return h.svc.SearchAdvanced(ctx, metadata.SearchOptions{
		Query: query.q, AnimeType: query.animeType, Status: query.status,
		OrderBy: query.orderBy, Sort: query.sort, Genres: query.genres,
		StudioID: query.studioID, SFW: query.sfw, Page: query.page, Limit: 24,
	})
}

type browseScrollInput struct {
	query        browseQuery
	studioName   string
	animes       []domain.Anime
	watchlistMap map[int64]bool
	hasNextPage  bool
}

func browseScrollData(input browseScrollInput) gin.H {
	return gin.H{
		"_fragment":    "anime_card_scroll",
		"Animes":       input.animes,
		"NextPage":     input.query.page + 1,
		"HasNextPage":  input.hasNextPage,
		"Query":        input.query.q,
		"Type":         input.query.animeType,
		"Status":       input.query.status,
		"OrderBy":      input.query.orderBy,
		"Sort":         input.query.sort,
		"Genres":       input.query.genres,
		"Studio":       input.query.studioID,
		"StudioName":   input.studioName,
		"SFW":          input.query.sfw,
		"WatchlistMap": input.watchlistMap,
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
	if target, ok := canonicalBrowseURL(c.Request.URL); ok {
		c.Redirect(http.StatusSeeOther, target)
		return
	}

	query, err := parseBrowseQuery(c)
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, err.Error())
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

	res, err := h.searchBrowse(c.Request.Context(), query)
	if err != nil {
		h.respondBrowseSearchError(c, query, err)
		return
	}

	user := server.CurrentUser(c)
	userID := server.CurrentUserID(c)
	animes := wrapAnimes(res.Animes)
	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, animes)
	if c.GetHeader("HX-Request") == "true" && query.page > 1 {
		c.HTML(http.StatusOK, "browse.gohtml", browseScrollData(browseScrollInput{query: query, animes: animes, watchlistMap: watchlistMap, hasNextPage: res.HasNextPage}))
		return
	}

	browseData := browseTemplateData(browsePageData{query: query, genresList: genresList, animes: animes, user: user, watchlistMap: watchlistMap, hasNextPage: res.HasNextPage})

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

	res, err := h.svc.SearchAdvanced(c.Request.Context(), metadata.SearchOptions{Query: query, SFW: true, Page: 1, Limit: 5})
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
			Image:       anime.Images.Webp.LargeImageURL,
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
