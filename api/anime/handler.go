package anime

import (
	"context"
	"encoding/json"
	"errors"
	"html"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/middleware"
	"mal/templates"

	"golang.org/x/sync/errgroup"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type quickSearchResult struct {
	ID    int    `json:"id"`    // anime mal id
	Title string `json:"title"` // display title
	Type  string `json:"type"`  // anime type (tv, movie, etc)
	Image string `json:"image"` // cover image url
}

func (h *Handler) HandleCatalog(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		renderNotFoundPage(r, w)
		return
	}

	user := middleware.GetUser(r.Context())

	if err := templates.GetRenderer().ExecuteTemplate(r.Context(), w, "index.gohtml", map[string]any{
		"User":        user,
		"CurrentPath": r.URL.Path,
	}); err != nil {
		log.Printf("render error: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

func (h *Handler) HandleCatalogAiring(w http.ResponseWriter, r *http.Request) {
	h.renderCatalogSection(w, r, "Airing")
}

func (h *Handler) HandleCatalogPopular(w http.ResponseWriter, r *http.Request) {
	h.renderCatalogSection(w, r, "Popular")
}

func (h *Handler) HandleCatalogContinue(w http.ResponseWriter, r *http.Request) {
	h.renderCatalogSection(w, r, "Continue")
}

// renderCatalogSection fetches catalog data (airing/popular/continue) and renders as htmx fragment
func (h *Handler) renderCatalogSection(w http.ResponseWriter, r *http.Request, section string) {
	user := middleware.GetUser(r.Context())
	userID := ""
	if user != nil {
		userID = user.ID
	}

	data, err := h.service.GetCatalogSection(r.Context(), userID, section)
	if err != nil {
		log.Printf("catalog %s error: %v", section, err)
		if section != "Continue" {
			writeInlineLoadError(w, "Failed to load "+section)
		}
		return
	}

	data["User"] = user
	data["Section"] = section

	// render section as htmx partial, not full page
	if err := templates.GetRenderer().ExecuteFragment(r.Context(), w, "index.gohtml", "catalog_section", data); err != nil {
		log.Printf("fragment render error: %v", err)
	}
}

func (h *Handler) HandleDiscover(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r.Context())

	if err := templates.GetRenderer().ExecuteTemplate(r.Context(), w, "discover.gohtml", map[string]any{
		"User":        user,
		"CurrentPath": r.URL.Path,
	}); err != nil {
		log.Printf("render error: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

func (h *Handler) HandleDiscoverTrending(w http.ResponseWriter, r *http.Request) {
	h.renderDiscoverSection(w, r, "Trending")
}

func (h *Handler) HandleDiscoverUpcoming(w http.ResponseWriter, r *http.Request) {
	h.renderDiscoverSection(w, r, "Upcoming")
}

func (h *Handler) HandleDiscoverTop(w http.ResponseWriter, r *http.Request) {
	h.renderDiscoverSection(w, r, "Top")
}

func (h *Handler) renderDiscoverSection(w http.ResponseWriter, r *http.Request, section string) {
	user := middleware.GetUser(r.Context())
	userID := ""
	if user != nil {
		userID = user.ID
	}

	data, err := h.service.GetDiscoverSection(r.Context(), userID, section)
	if err != nil {
		log.Printf("discover %s error: %v", section, err)
		writeInlineLoadError(w, "Failed to load "+section)
		return
	}

	data["User"] = user
	data["Section"] = section

	if err := templates.GetRenderer().ExecuteFragment(r.Context(), w, "discover.gohtml", "discover_section", data); err != nil {
		log.Printf("fragment render error: %v", err)
	}
}

// HandleBrowse handles anime search/browse with filters. supports htmx partial loading.
func (h *Handler) HandleBrowse(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r.Context())

	// parse query params for search/filter
	q := r.URL.Query().Get("q")
	animeType := r.URL.Query().Get("type")
	status := r.URL.Query().Get("status")
	orderBy := r.URL.Query().Get("order_by")
	sort := r.URL.Query().Get("sort")
	sfw := r.URL.Query().Get("sfw") != "false" // default to safe

	var genres []int
	for _, g := range r.URL.Query()["genres"] {
		id, err := strconv.Atoi(g)
		if err == nil {
			genres = append(genres, id)
		}
	}

	page := parsePageParam(r)

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	res, err := h.service.jikanClient.SearchAdvanced(ctx, q, animeType, status, orderBy, sort, genres, sfw, page, 24)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		log.Printf("browse error: %v", err)
	}

	if r.Header.Get("HX-Request") == "true" {
		// htmx: return just the card scroll fragment with watchlist state
		watchlistMap := make(map[int]bool)
		if user != nil {
			watchlist, _ := h.service.db.GetUserWatchList(ctx, user.ID)
			for _, entry := range watchlist {
				watchlistMap[int(entry.AnimeID)] = true
			}
		}

		w.Header().Set("Content-Type", "text/html")
		err := templates.GetRenderer().ExecuteFragment(ctx, w, "browse.gohtml", "anime_card_scroll", map[string]any{
			"Animes":       res.Animes,
			"NextPage":     page + 1,
			"HasNextPage":  res.HasNextPage,
			"Query":        q,
			"Type":         animeType,
			"Status":       status,
			"OrderBy":      orderBy,
			"Sort":         sort,
			"Genres":       genres,
			"SFW":          sfw,
			"WatchlistMap": watchlistMap,
		})
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				log.Printf("fragment render error: %v", err)
			}
		}
		return
	}

	// full page load: fetch genres list and full watchlist
	genresList, err := h.service.jikanClient.GetAnimeGenres(ctx)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			log.Printf("genres error: %v", err)
		}
	}

	watchlistMap := make(map[int]bool)
	var watchlistIDs []int64
	if user != nil {
		watchlist, _ := h.service.db.GetUserWatchList(ctx, user.ID)
		watchlistIDs = make([]int64, len(watchlist))
		for i, entry := range watchlist {
			watchlistMap[int(entry.AnimeID)] = true
			watchlistIDs[i] = entry.AnimeID
		}
	}

	if err := templates.GetRenderer().ExecuteTemplate(ctx, w, "browse.gohtml", map[string]any{
		"User":         user,
		"CurrentPath":  r.URL.Path,
		"Query":        q,
		"Type":         animeType,
		"Status":       status,
		"OrderBy":      orderBy,
		"Sort":         sort,
		"Genres":       genres,
		"SFW":          sfw,
		"GenresList":   genresList,
		"Animes":       res.Animes,
		"HasNextPage":  res.HasNextPage,
		"NextPage":     page + 1,
		"WatchlistMap": watchlistMap,
		"WatchlistIDs": watchlistIDs,
	}); err != nil {
		if !errors.Is(err, context.Canceled) {
			log.Printf("render error: %v", err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
	}
}

// HandleAnimeDetails renders anime detail page. handles htmx requests for characters/recommendations sections.
func (h *Handler) HandleAnimeDetails(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/anime/")
	idStr = strings.TrimSuffix(idStr, "/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		renderNotFoundPage(r, w)
		return
	}

	user := middleware.GetUser(r.Context())

	// htmx: return just the section (characters or recommendations)
	section := r.URL.Query().Get("section")
	if section != "" && r.Header.Get("HX-Request") == "true" {
		h.renderAnimeDetailsSection(w, r, id, section)
		return
	}

	var (
		anime         jikan.Anime
		status        string
		episodesCount int
		watchlistIDs  []int64
	)

	g, gCtx := errgroup.WithContext(r.Context())

	// fetch anime details + episode count if airing
	g.Go(func() error {
		var err error
		anime, err = h.service.jikanClient.GetAnimeByID(gCtx, id)
		if err == nil && anime.Airing {
			// get episode count for airing anime (may span multiple pages)
			eps, err := h.service.jikanClient.GetEpisodes(gCtx, id, 1)
			if err == nil {
				if eps.Pagination.LastVisiblePage > 1 {
					lastEps, err := h.service.jikanClient.GetEpisodes(gCtx, id, eps.Pagination.LastVisiblePage)
					if err == nil && len(lastEps.Data) > 0 {
						lastEp := lastEps.Data[len(lastEps.Data)-1]
						count, _ := strconv.Atoi(lastEp.Episode)
						episodesCount = count
					}
				} else if len(eps.Data) > 0 {
					lastEp := eps.Data[len(eps.Data)-1]
					count, _ := strconv.Atoi(lastEp.Episode)
					episodesCount = count
				}
			}
		}
		return err
	})

	if user != nil {
		// fetch user's watchlist status for this anime
		g.Go(func() error {
			entry, err := h.service.db.GetWatchListEntry(gCtx, db.GetWatchListEntryParams{
				UserID:  user.ID,
				AnimeID: int64(id),
			})
			if err == nil {
				status = entry.Status
			}
			return nil
		})
		// fetch all watchlist ids for nav state
		g.Go(func() error {
			watchlist, err := h.service.db.GetUserWatchList(gCtx, user.ID)
			if err == nil {
				watchlistIDs = make([]int64, len(watchlist))
				for i, e := range watchlist {
					watchlistIDs[i] = e.AnimeID
				}
			}
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		log.Printf("anime details fetch error: %v", err)
		renderNotFoundPage(r, w)
		return
	}

	if err := templates.GetRenderer().ExecuteTemplate(r.Context(), w, "anime.gohtml", map[string]any{
		"Anime":         anime,
		"User":          user,
		"Status":        status,
		"CurrentPath":   r.URL.Path,
		"WatchlistIDs":  watchlistIDs,
		"EpisodesCount": episodesCount,
	}); err != nil {
		log.Printf("render error: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

// renderAnimeDetailsSection fetches and renders htmx partial for character/recommendation sections
func (h *Handler) renderAnimeDetailsSection(w http.ResponseWriter, r *http.Request, id int, section string) {
	ctx := r.Context()
	var data any
	var err error

	switch section {
	case "characters":
		data, err = h.service.jikanClient.GetAnimeCharacters(ctx, id)
	case "recommendations":
		data, err = h.service.jikanClient.GetAnimeRecommendations(ctx, id)
	default:
		http.Error(w, "Invalid section", http.StatusBadRequest)
		return
	}

	if err != nil {
		log.Printf("anime details %s error: %v", section, err)
		writeInlineLoadError(w, "Failed to load "+section)
		return
	}

	tplName := "anime_characters"
	if section == "recommendations" {
		tplName = "anime_recommendations"
	}

	// render htmx partial for the section
	if err := templates.GetRenderer().ExecuteFragment(ctx, w, "anime.gohtml", tplName, data); err != nil {
		log.Printf("fragment render error: %v", err)
	}
}

func (h *Handler) HandleHTMLWatchOrder(w http.ResponseWriter, r *http.Request) {
	animeIdStr := r.URL.Query().Get("animeId")
	id, err := strconv.Atoi(animeIdStr)
	if err != nil {
		http.Error(w, `<div class="mt-8 text-sm text-red-400">Invalid anime ID.</div>`, http.StatusBadRequest)
		return
	}

	relations, err := h.service.jikanClient.GetFullRelations(r.Context(), id)
	if err != nil {
		log.Printf("watch order error: %v", err)
		http.Error(w, `<div class="mt-8 text-sm text-red-400">Failed to load watch order.</div>`, http.StatusInternalServerError)
		return
	}

	user := middleware.GetUser(r.Context())
	watchlistMap := make(map[int64]bool)
	if user != nil {
		watchlist, _ := h.service.db.GetUserWatchList(r.Context(), user.ID)
		for _, entry := range watchlist {
			watchlistMap[entry.AnimeID] = true
		}
	}

	if err := templates.GetRenderer().ExecuteFragment(r.Context(), w, "anime.gohtml", "watch_order", map[string]any{
		"Relations":    relations,
		"AnimeID":      id,
		"WatchlistMap": watchlistMap,
	}); err != nil {
		log.Printf("render error: %v", err)
	}
}

func (h *Handler) HandleQuickSearch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	query := r.URL.Query().Get("q")
	if query == "" {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode([]quickSearchResult{})
		return
	}
	res, err := h.service.jikanClient.SearchAdvanced(r.Context(), query, "", "", "", "", nil, true, 1, 5)
	if err != nil {
		log.Printf("quick search error: %v", err)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode([]quickSearchResult{})
		return
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
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(output)
}

func (h *Handler) HandleRandomAnime(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	anime, err := h.service.jikanClient.GetRandomAnime(r.Context())
	if err != nil {
		log.Printf("random anime error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to fetch random anime"})
		return
	}

	if anime.MalID == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "No anime found"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{"data": anime})
}

func (h *Handler) HandleSearch(w http.ResponseWriter, r *http.Request) {
	renderNotFoundPage(r, w)
}

func renderNotFoundPage(r *http.Request, w http.ResponseWriter) {
	w.WriteHeader(http.StatusNotFound)
	if err := templates.GetRenderer().ExecuteTemplate(r.Context(), w, "not_found.gohtml", map[string]any{
		"CurrentPath": r.URL.Path,
	}); err != nil {
		log.Printf("render error: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

func writeInlineLoadError(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "text/html")
	_, _ = w.Write([]byte(`<p style="color: var(--text-muted); font-size: var(--text-sm);">` + html.EscapeString(message) + `</p>`))
}

func parsePageParam(r *http.Request) int {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		return 1
	}
	return page
}
