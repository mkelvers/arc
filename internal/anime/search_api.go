package anime

import (
	"fmt"
	"mal/integrations/metadata"
	"mal/internal/server"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const searchAnimeLimit = 24

type searchItem struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Label       string `json:"label"`
	Subtitle    string `json:"subtitle"`
	Href        string `json:"href"`
	Image       string `json:"image,omitempty"`
	Icon        string `json:"icon,omitempty"`
	InWatchlist bool   `json:"inWatchlist,omitempty"`
}

type searchResponse struct {
	Items       []searchItem `json:"items"`
	HasNextPage bool         `json:"hasNextPage"`
	NextPage    int          `json:"nextPage,omitempty"`
}

func (h *AnimeHandler) HandleSearchAPI(c *gin.Context) {
	user := server.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	query := strings.TrimSpace(c.Query("q"))
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid page"})
		return
	}

	if query == "" || len(query) < 2 {
		c.JSON(http.StatusOK, searchResponse{})
		return
	}

	items, hasNextPage := h.searchAnimeResults(c, user.ID, query, page)
	c.JSON(http.StatusOK, searchResponse{
		Items:       items,
		HasNextPage: hasNextPage,
		NextPage:    page + 1,
	})
}

func (h *AnimeHandler) searchAnimeResults(c *gin.Context, userID string, query string, page int) ([]searchItem, bool) {
	res, err := h.svc.SearchAdvanced(c.Request.Context(), metadata.SearchOptions{Query: query, SFW: true, Page: page, Limit: searchAnimeLimit})
	if err != nil {
		return nil, false
	}

	animes := wrapAnimes(res.Animes)
	watchlistMap := h.watchlistMapForAnimes(c.Request.Context(), userID, animes)
	items := make([]searchItem, 0, len(animes))
	for _, anime := range animes {
		items = append(items, searchItem{
			ID:          fmt.Sprintf("anime:%d", anime.MalID),
			Type:        "anime",
			Label:       anime.DisplayTitle(),
			Subtitle:    strings.TrimSpace("Anime " + anime.Type),
			Href:        fmt.Sprintf("/anime/%d", anime.MalID),
			Image:       anime.Images.Webp.LargeImageURL,
			InWatchlist: watchlistMap[int64(anime.MalID)],
		})
	}
	return items, res.HasNextPage
}
