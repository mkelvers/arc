package playback

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"maps"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/middleware"
	"mal/templates"
)

type Handler struct {
	svc         *Service
	jikanClient *jikan.Client // client for Jikan API (MyAnimeList)
}

func NewHandler(svc *Service, jikanClient *jikan.Client) *Handler {
	return &Handler{svc: svc, jikanClient: jikanClient}
}

// renderNotFoundPage renders the 404 page.
func renderNotFoundPage(r *http.Request, w http.ResponseWriter) {
	w.WriteHeader(http.StatusNotFound)
	if err := templates.GetRenderer().ExecuteTemplate(r.Context(), w, "not_found.gohtml", map[string]any{
		"CurrentPath": r.URL.Path,
	}); err != nil {
		log.Printf("render error: %v", err)
	}
}

// HandleWatchPage serves the anime watch page.
func (h *Handler) HandleWatchPage(w http.ResponseWriter, r *http.Request) {
	// path format: /anime/123/watch
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		renderNotFoundPage(r, w)
		return
	}
	idStr := parts[2]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		renderNotFoundPage(r, w)
		return
	}

	anime, err := h.jikanClient.GetAnimeByID(r.Context(), id)
	if err != nil {
		renderNotFoundPage(r, w)
		return
	}

	allEpisodes, err := h.jikanClient.GetAllEpisodes(r.Context(), id)
	if err != nil {
		log.Printf("failed to fetch episodes: %v", err)
	}

	user := middleware.GetUser(r.Context())

	// fetch user's watchlist to highlight episodes and show status
	var watchlistIDs []int64
	var watchlistStatus string
	if user != nil {
		watchlist, _ := h.svc.db.GetUserWatchList(r.Context(), user.ID)
		watchlistIDs = make([]int64, len(watchlist))
		for i, entry := range watchlist {
			watchlistIDs[i] = entry.AnimeID
			if entry.AnimeID == int64(id) {
				watchlistStatus = entry.Status
			}
		}
	}

	// resolve current episode: query param > saved progress > first episode
	currentEpID := r.URL.Query().Get("ep")
	if currentEpID == "" {
		if user != nil {
			entry, err := h.svc.db.GetWatchListEntry(r.Context(), db.GetWatchListEntryParams{
				UserID:  user.ID,
				AnimeID: int64(id),
			})
			if err == nil && entry.CurrentEpisode.Valid {
				currentEpID = strconv.FormatInt(entry.CurrentEpisode.Int64, 10)
				// redirect to include ep param for consistent URLs
				http.Redirect(w, r, fmt.Sprintf("/anime/%d/watch?ep=%s", id, currentEpID), http.StatusFound)
				return
			}
		}
		currentEpID = "1"
	}

	mode := r.URL.Query().Get("mode")
	userID := ""
	if user != nil {
		userID = user.ID
	}

	titleCandidates := []string{anime.Title}
	if anime.TitleEnglish != "" && anime.TitleEnglish != anime.Title {
		titleCandidates = append(titleCandidates, anime.TitleEnglish)
	}
	if anime.TitleJapanese != "" {
		titleCandidates = append(titleCandidates, anime.TitleJapanese)
	}

	watchData, err := h.svc.BuildWatchPageData(r.Context(), id, titleCandidates, currentEpID, mode, userID)
	if err != nil {
		log.Printf("watch data error: %v", err)
	}

	// Fill gaps with placeholder episodes if fallback has more
	if watchData.FallbackEpisodes != nil {
		maxCount := 0
		for _, count := range watchData.FallbackEpisodes {
			if count > maxCount {
				maxCount = count
			}
		}

		epMap := make(map[int]jikan.Episode)
		for _, ep := range allEpisodes {
			epMap[ep.MalID] = ep
		}

		if maxCount > 0 {
			var filled []jikan.Episode
			for i := 1; i <= maxCount; i++ {
				if ep, ok := epMap[i]; ok {
					filled = append(filled, ep)
				} else {
					filled = append(filled, jikan.Episode{
						MalID:   i,
						Episode: fmt.Sprintf("Episode %d", i),
						Title:   fmt.Sprintf("Episode %d", i),
					})
				}
			}
			allEpisodes = filled
		}
	}

	sort.Slice(allEpisodes, func(i, j int) bool {
		return allEpisodes[i].MalID < allEpisodes[j].MalID
	})

	// fetch relations to build season/movie list
	relations, err := h.jikanClient.GetFullRelations(r.Context(), id)
	if err != nil {
		log.Printf("failed to fetch relations: %v", err)
	}

	type SeasonEntry struct {
		MalID     int
		Title     string
		Prefix    string
		IsCurrent bool
	}

	var tvSeasons []SeasonEntry
	var movies []SeasonEntry
	counter := 1

	for _, rel := range relations {
		if strings.ToLower(rel.Anime.Type) == "tv" {
			tvSeasons = append(tvSeasons, SeasonEntry{
				MalID:     rel.Anime.MalID,
				Title:     rel.Anime.DisplayTitle(),
				Prefix:    fmt.Sprintf("%02d", counter),
				IsCurrent: rel.IsCurrent,
			})
			counter++
		}
	}

	for _, rel := range relations {
		if strings.ToLower(rel.Anime.Type) == "movie" {
			movies = append(movies, SeasonEntry{
				MalID:     rel.Anime.MalID,
				Title:     rel.Anime.DisplayTitle(),
				Prefix:    "Mov",
				IsCurrent: rel.IsCurrent,
			})
		}
	}

	allSeasons := append(tvSeasons, movies...)

	if err := templates.GetRenderer().ExecuteTemplate(r.Context(), w, "watch.gohtml", map[string]any{
		"Anime":           anime,
		"Episodes":        allEpisodes,
		"WatchData":       watchData,
		"User":            user,
		"CurrentPath":     r.URL.Path,
		"CurrentEpID":     currentEpID,
		"WatchlistIDs":    watchlistIDs,
		"WatchlistStatus": watchlistStatus,
		"Seasons":         allSeasons,
	}); err != nil {
		log.Printf("render error: %v", err)
	}
}

// HandleProxy proxies media requests through the backend to avoid CORS and hide source URLs.
func (h *Handler) HandleProxy(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusBadRequest)
		return
	}

	// determine proxy scope based on URL suffix
	scope := proxyScopeStream
	if strings.HasSuffix(r.URL.Path, "/segment") {
		scope = proxyScopeSegment
	} else if strings.HasSuffix(r.URL.Path, "/subtitle") {
		scope = proxyScopeSubtitle
	}

	targetURL, referer, err := h.svc.resolveProxyToken(r.Context(), token, scope)
	if err != nil {
		http.Error(w, "invalid token", http.StatusForbidden)
		return
	}

	rangeHeader := r.Header.Get("Range")

	statusCode, headers, content, bodyReader, err := h.svc.ProxyStream(r.Context(), targetURL, referer, rangeHeader)
	if err != nil {
		log.Printf("proxy error for %s: %v", targetURL, err)
		http.Error(w, "proxy failed", http.StatusBadGateway)
		return
	}

	maps.Copy(w.Header(), headers)
	w.WriteHeader(statusCode)

	if bodyReader != nil {
		defer func() { _ = bodyReader.Close() }()
		_, _ = io.Copy(w, bodyReader)
	} else {
		_, _ = w.Write(content)
	}
}

// HandleSaveProgress saves playback progress for a user.
func (h *Handler) HandleSaveProgress(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := middleware.GetUser(r.Context())
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		MalID       int64   `json:"mal_id"`
		Episode     int     `json:"episode"`
		TimeSeconds float64 `json:"time_seconds"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// We fetch the anime info to seed the DB if it's the first time saving progress for this show
	anime, err := h.jikanClient.GetAnimeByID(r.Context(), int(req.MalID))
	var seed *db.UpsertAnimeParams
	if err == nil {
		seed = &db.UpsertAnimeParams{
			ID:              int64(anime.MalID),
			TitleOriginal:   anime.Title,
			TitleEnglish:    sql.NullString{String: anime.TitleEnglish, Valid: anime.TitleEnglish != ""},
			TitleJapanese:   sql.NullString{String: anime.TitleJapanese, Valid: anime.TitleJapanese != ""},
			ImageUrl:        anime.ImageURL(),
			Airing:          sql.NullBool{Bool: anime.Airing, Valid: true},
			DurationSeconds: sql.NullFloat64{Float64: anime.DurationSeconds(), Valid: anime.DurationSeconds() > 0},
		}
	}

	if err := h.svc.SaveProgress(r.Context(), user.ID, req.MalID, req.Episode, req.TimeSeconds, seed); err != nil {
		log.Printf("failed to save progress: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleCompleteAnime marks an anime as completed for a user.
func (h *Handler) HandleCompleteAnime(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := middleware.GetUser(r.Context())
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		MalID   int64 `json:"mal_id"`
		Episode int   `json:"episode"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Seed anime info if needed
	anime, err := h.jikanClient.GetAnimeByID(r.Context(), int(req.MalID))
	var seed *db.UpsertAnimeParams
	if err == nil {
		seed = &db.UpsertAnimeParams{
			ID:              int64(anime.MalID),
			TitleOriginal:   anime.Title,
			TitleEnglish:    sql.NullString{String: anime.TitleEnglish, Valid: anime.TitleEnglish != ""},
			TitleJapanese:   sql.NullString{String: anime.TitleJapanese, Valid: anime.TitleJapanese != ""},
			ImageUrl:        anime.ImageURL(),
			Airing:          sql.NullBool{Bool: anime.Airing, Valid: true},
			DurationSeconds: sql.NullFloat64{Float64: anime.DurationSeconds(), Valid: anime.DurationSeconds() > 0},
		}
	}

	if err := h.svc.CompleteAnime(r.Context(), user.ID, req.MalID, req.Episode, seed); err != nil {
		log.Printf("failed to complete anime: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleEpisodeData returns episode streaming data for the player.
func (h *Handler) HandleEpisodeData(w http.ResponseWriter, r *http.Request) {
	// path: /api/watch/episode/{animeId}/{episodeId}
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 6 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	animeID, err := strconv.Atoi(parts[4])
	if err != nil {
		http.Error(w, "invalid animeId", http.StatusBadRequest)
		return
	}

	episodeID := parts[5]

	user := middleware.GetUser(r.Context())
	userID := ""
	if user != nil {
		userID = user.ID
	}

	anime, err := h.jikanClient.GetAnimeByID(r.Context(), animeID)
	if err != nil {
		http.Error(w, "anime not found", http.StatusNotFound)
		return
	}

	titleCandidates := []string{anime.Title}
	if anime.TitleEnglish != "" && anime.TitleEnglish != anime.Title {
		titleCandidates = append(titleCandidates, anime.TitleEnglish)
	}
	if anime.TitleJapanese != "" {
		titleCandidates = append(titleCandidates, anime.TitleJapanese)
	}

	watchData, err := h.svc.BuildWatchPageData(r.Context(), animeID, titleCandidates, episodeID, "", userID)
	if err != nil {
		http.Error(w, "failed to build watch data", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := writeJSON(w, map[string]any{
		"mal_id":          watchData.MalID,
		"title":           watchData.Title,
		"current_episode": watchData.CurrentEpisode,
		"total_episodes":  anime.Episodes,
		"initial_mode":    watchData.InitialMode,
		"token":           "", // The token might be per-source, wait, in Go it was per-mode?
		"available_modes": watchData.AvailableModes,
		"mode_sources":    watchData.ModeSources,
		"segments":        watchData.Segments,
		"episode_title":   "", // Find episode title if possible
	}); err != nil {
		log.Printf("watch page encode error: %v", err)
	}
}

// HandleEpisodeThumbnails returns episode list for the thumbnail strip.
func (h *Handler) HandleEpisodeThumbnails(w http.ResponseWriter, r *http.Request) {
	// path: /api/watch/thumbnails/{animeId}
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	id, err := strconv.Atoi(parts[4])
	if err != nil {
		http.Error(w, "invalid animeId", http.StatusBadRequest)
		return
	}

	allEpisodes, err := h.jikanClient.GetAllEpisodes(r.Context(), id)
	if err != nil {
		log.Printf("failed to fetch thumbnails/episodes: %v", err)
	}

	// Fill gaps if anime has known total
	anime, _ := h.jikanClient.GetAnimeByID(r.Context(), id)
	if anime.Episodes > 0 && anime.Episodes > len(allEpisodes) {
		epMap := make(map[int]jikan.Episode)
		for _, ep := range allEpisodes {
			epMap[ep.MalID] = ep
		}
		var filled []jikan.Episode
		for i := 1; i <= anime.Episodes; i++ {
			if ep, ok := epMap[i]; ok {
				filled = append(filled, ep)
			} else {
				filled = append(filled, jikan.Episode{
					MalID:   i,
					Episode: fmt.Sprintf("Episode %d", i),
					Title:   fmt.Sprintf("Episode %d", i),
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

	w.Header().Set("Content-Type", "application/json")
	if err := writeJSON(w, results); err != nil {
		log.Printf("thumbnails encode error: %v", err)
	}
}

func writeJSON(w http.ResponseWriter, v any) error {
	return json.NewEncoder(w).Encode(v)
}
