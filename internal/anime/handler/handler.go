package handler

import (
	"context"
	"fmt"
	"log"
	"mal/internal/domain"
	"mal/internal/server"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type AnimeHandler struct {
	svc domain.AnimeService
}

func NewAnimeHandler(svc domain.AnimeService) *AnimeHandler {
	return &AnimeHandler{svc: svc}
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
	r.GET("/browse", h.HandleBrowse)
	r.GET("/anime/:id", h.HandleAnimeDetails)
	r.GET("/api/watch-order", h.HandleHTMLWatchOrder)
	r.GET("/api/search-quick", h.HandleQuickSearch)
	r.GET("/api/jikan/random/anime", h.HandleRandomAnime)
}

func (h *AnimeHandler) HandleCatalog(c *gin.Context) {
	c.HTML(http.StatusOK, "index.gohtml", gin.H{
		"CurrentPath": "/",
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
	userID := "" // TODO: get from auth context
	data, err := h.svc.GetCatalogSection(c.Request.Context(), userID, section)
	if err != nil {
		log.Printf("catalog %s error: %v", section, err)
		return
	}

	data["Section"] = section
	data["_fragment"] = "catalog_section"
	c.HTML(http.StatusOK, "index.gohtml", data)
}

func (h *AnimeHandler) HandleDiscover(c *gin.Context) {
	c.HTML(http.StatusOK, "discover.gohtml", gin.H{
		"CurrentPath": "/discover",
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
	userID := "" // TODO: get from auth context
	data, err := h.svc.GetDiscoverSection(c.Request.Context(), userID, section)
	if err != nil {
		log.Printf("discover %s error: %v", section, err)
		return
	}

	data["Section"] = section
	data["_fragment"] = "discover_section"
	c.HTML(http.StatusOK, "discover.gohtml", data)
}

func (h *AnimeHandler) HandleBrowse(c *gin.Context) {
	q := c.Query("q")
	animeType := c.Query("type")
	status := c.Query("status")
	orderBy := c.Query("order_by")
	sort := c.Query("sort")
	sfw := c.Query("sfw") != "false"

	var genres []int
	for _, g := range c.QueryArray("genres") {
		id, _ := strconv.Atoi(g)
		if id > 0 {
			genres = append(genres, id)
		}
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}

	res, err := h.svc.SearchAdvanced(c.Request.Context(), q, animeType, status, orderBy, sort, genres, sfw, page, 24)
	if err != nil {
		log.Printf("browse error: %v", err)
	}

	if c.GetHeader("HX-Request") == "true" {
		c.HTML(http.StatusOK, "browse.gohtml", gin.H{
			"_fragment":   "anime_card_scroll",
			"Animes":      res.Animes,
			"NextPage":    page + 1,
			"HasNextPage": res.HasNextPage,
			"Query":       q,
			"Type":        animeType,
			"Status":      status,
			"OrderBy":     orderBy,
			"Sort":        sort,
			"Genres":      genres,
			"SFW":         sfw,
		})
		return
	}

	genresList, _ := h.svc.GetGenres(c.Request.Context())

	c.HTML(http.StatusOK, "browse.gohtml", gin.H{
		"CurrentPath": "/browse",
		"Query":       q,
		"Type":        animeType,
		"Status":      status,
		"OrderBy":     orderBy,
		"Sort":        sort,
		"Genres":      genres,
		"SFW":         sfw,
		"GenresList":  genresList,
		"Animes":      res.Animes,
		"HasNextPage": res.HasNextPage,
		"NextPage":    page + 1,
	})
}

func (h *AnimeHandler) HandleAnimeDetails(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.Status(http.StatusNotFound)
		return
	}

	section := c.Query("section")
	if section != "" && c.GetHeader("HX-Request") == "true" {
		var data any
		var tplName string
		var err error
		switch section {
		case "characters":
			data, err = h.svc.GetCharacters(c.Request.Context(), id)
			tplName = "anime_characters"
		case "recommendations":
			data, err = h.svc.GetRecommendations(c.Request.Context(), id)
			tplName = "anime_recommendations"
		}

		if err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}

		c.HTML(http.StatusOK, "anime.gohtml", gin.H{
			"_fragment": tplName,
			"Data":      data,
		})
		return
	}

	anime, err := h.svc.GetAnimeByID(c.Request.Context(), id)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"Anime":       anime,
		"CurrentPath": fmt.Sprintf("/anime/%d", id),
	})
}

func (h *AnimeHandler) HandleHTMLWatchOrder(c *gin.Context) {
	id, _ := strconv.Atoi(c.Query("animeId"))
	if id <= 0 {
		c.Status(http.StatusBadRequest)
		return
	}

	relations, err := h.svc.GetRelations(c.Request.Context(), id)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"_fragment": "watch_order",
		"Relations": relations,
		"AnimeID":   id,
	})
}

func (h *AnimeHandler) HandleQuickSearch(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusOK, []any{})
		return
	}

	res, err := h.svc.SearchAdvanced(c.Request.Context(), query, "", "", "", "", nil, true, 1, 5)
	if err != nil {
		c.JSON(http.StatusOK, []any{})
		return
	}

	type quickSearchResult struct {
		ID    int    `json:"id"`
		Title string `json:"title"`
		Type  string `json:"type"`
		Image string `json:"image"`
	}

	output := make([]quickSearchResult, len(res.Animes))
	for i, anime := range res.Animes {
		output[i] = quickSearchResult{
			ID:    anime.MalID,
			Title: anime.DisplayTitle(),
			Type:  anime.Type,
			Image: anime.ImageURL(),
		}
	}
	c.JSON(http.StatusOK, output)
}

func (h *AnimeHandler) HandleRandomAnime(c *gin.Context) {
	anime, err := h.svc.GetRandomAnime(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch random anime"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": anime})
}
