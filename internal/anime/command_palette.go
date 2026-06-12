package anime

import (
	"context"
	"fmt"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/server"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

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
	user := server.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	query := strings.TrimSpace(c.Query("q"))
	items := make([]commandPaletteItem, 0, 12)

	if query != "" {
		values := url.Values{}
		values.Set("q", query)

		items = append(items, commandPaletteItem{
			ID:       "search:" + strings.ToLower(query),
			Type:     "search",
			Label:    fmt.Sprintf("Search anime for %q", query),
			Subtitle: "Browse",
			Href:     "/browse?" + values.Encode(),
			Icon:     "search",
		})

		if len(query) >= 2 {
			items = append(items, h.commandPaletteAnimeResults(c, query)...)
		}

		items = append(items, h.commandPaletteNavigationItems(query)...)
		items = append(items, h.commandPaletteContinueItems(c, user.ID, query)...)
		items = append(items, h.commandPalettePersonalItems(c, user.ID, query)...)
		c.JSON(http.StatusOK, items)
		return
	}

	items = append(items, h.commandPaletteContinueItems(c, user.ID, query)...)
	items = append(items, h.commandPaletteNavigationItems(query)...)
	items = append(items, h.commandPalettePersonalItems(c, user.ID, query)...)
	c.JSON(http.StatusOK, items)
}

func (h *AnimeHandler) commandPaletteNavigationItems(query string) []commandPaletteItem {
	all := []commandPaletteItem{
		{ID: "nav:discover", Type: "navigation", Label: "Go to Discover", Subtitle: "Navigation", Href: "/discover", Icon: "compass"},
		{ID: "nav:watchlist", Type: "navigation", Label: "Go to Watchlist", Subtitle: "Navigation", Href: "/watchlist", Icon: "bookmark"},
		{ID: "nav:popular", Type: "navigation", Label: "Browse popular", Subtitle: "Browse", Href: "/browse?order_by=popularity&sort=asc", Icon: "trending"},
		{ID: "nav:airing", Type: "navigation", Label: "Currently airing", Subtitle: "Browse", Href: "/browse?status=airing&order_by=popularity&sort=asc", Icon: "play"},
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

	animes := wrapAnimes(res.Animes)
	items := make([]commandPaletteItem, 0, len(animes))
	for _, anime := range animes {
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
	return row.DisplayTitle()
}

func watchlistTitle(row domain.UserWatchListRow) string {
	return row.DisplayTitle()
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
