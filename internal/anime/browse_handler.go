package anime

import (
	"context"
	"fmt"
	"log/slog"
	"mal/internal/domain"
	"mal/internal/server"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type browseQuery struct {
	Query   string
	Type    string
	Status  string
	OrderBy string
	Sort    string
	SFW     bool
	Studio  int
	Genres  []int
	Page    int
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
		Query:   c.Query("q"),
		Type:    c.Query("type"),
		Status:  c.Query("status"),
		OrderBy: orderBy,
		Sort:    sort,
		SFW:     c.Query("sfw") != "false",
		Studio:  studioID,
		Genres:  genres,
		Page:    page,
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
	CurrentPath string
	browseQuery
	StudioName   string
	GenresList   []domain.Genre
	Animes       []domain.Anime
	User         any
	WatchlistMap map[int64]bool
	HasNextPage  bool
	fragment     string
}

func (data browsePageData) NextPage() int {
	return data.Page + 1
}

func (data browsePageData) TemplateFragment() string {
	return data.fragment
}

func (data browsePageData) BrowseURLValues() (query, animeType, status, orderBy, sort string, studio int, sfw bool, genres []int, page int) {
	return data.Query, data.Type, data.Status, data.OrderBy, data.Sort, data.Studio, data.SFW, data.Genres, data.Page
}

func (h *AnimeHandler) searchBrowse(ctx context.Context, query browseQuery) (domain.SearchResult, error) {
	return h.svc.SearchAdvanced(ctx, domain.SearchOptions{
		Query: query.Query, AnimeType: query.Type, Status: query.Status,
		OrderBy: query.OrderBy, Sort: query.Sort, Genres: query.Genres,
		StudioID: query.Studio, SFW: query.SFW, Page: query.Page, Limit: 24,
	})
}

func (h *AnimeHandler) respondBrowseSearchError(c *gin.Context, query browseQuery, err error) {
	server.RespondError(
		c,
		http.StatusInternalServerError,
		"browse_search_failed",
		"anime",
		"failed to load browse results",
		map[string]any{
			"q":        query.Query,
			"type":     query.Type,
			"status":   query.Status,
			"order_by": query.OrderBy,
			"sort":     query.Sort,
			"studio":   query.Studio,
			"sfw":      query.SFW,
			"page":     query.Page,
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
		slog.WarnContext(c.Request.Context(),
			"genres_fetch_failed", "component", "anime", "fields", map[string]any{"q": query.Query, "type": query.Type, "status": query.Status}, "error", err)
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
	browseData := browsePageData{
		CurrentPath:  "/browse",
		browseQuery:  query,
		GenresList:   genresList,
		Animes:       animes,
		User:         user,
		WatchlistMap: watchlistMap,
		HasNextPage:  res.HasNextPage,
	}
	if c.GetHeader("HX-Request") == "true" && query.Page > 1 {
		browseData.fragment = "anime_card_scroll"
		c.HTML(http.StatusOK, "browse.gohtml", browseData)
		return
	}

	if c.GetHeader("HX-Request") == "true" {
		browseData.fragment = "browse_content"
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

	res, err := h.svc.SearchAdvanced(c.Request.Context(), domain.SearchOptions{Query: query, SFW: true, Page: 1, Limit: 5})
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
