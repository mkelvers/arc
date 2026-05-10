package watchlist

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"mal/internal/db"
	"mal/internal/middleware"
	"mal/templates"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// HandleUpdateWatchlist adds or updates anime in user's watchlist. accepts json {animeId, status}.
func (h *Handler) HandleUpdateWatchlist(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := middleware.GetUser(r.Context())
	if user == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		AnimeID int64  `json:"animeId"`
		Status  string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	// default status if not provided
	if body.Status == "" {
		body.Status = "plan_to_watch"
	}

	if err := h.service.AddToWatchlist(r.Context(), user.ID, body.AnimeID, body.Status); err != nil {
		log.Printf("failed to add to watchlist: %v", err)
		http.Error(w, "failed to add to watchlist", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleDeleteWatchlist removes anime from user's watchlist. expects /api/watchlist/{animeId}.
func (h *Handler) HandleDeleteWatchlist(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r.Context())
	if user == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	animeIDStr := r.URL.Path[len("/api/watchlist/"):]
	animeID, err := strconv.ParseInt(animeIDStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid anime id", http.StatusBadRequest)
		return
	}

	if _, err := h.service.RemoveEntry(r.Context(), user.ID, animeID); err != nil {
		log.Printf("failed to remove from watchlist: %v", err)
		http.Error(w, "failed to remove from watchlist", http.StatusInternalServerError)
		return
	}

	// htmx: redirect to watchlist page after delete
	w.Header().Set("HX-Redirect", "/watchlist")
	w.WriteHeader(http.StatusOK)
}

// HandleDeleteContinueWatching removes entry from user's continue watching. expects /api/continue-watching/{animeId}.
func (h *Handler) HandleDeleteContinueWatching(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r.Context())
	if user == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	animeIDStr := r.URL.Path[len("/api/continue-watching/"):]
	animeID, err := strconv.ParseInt(animeIDStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid anime id", http.StatusBadRequest)
		return
	}

	if err := h.service.DeleteContinueWatching(r.Context(), user.ID, animeID); err != nil {
		log.Printf("failed to remove from continue watching: %v", err)
		http.Error(w, "failed to remove from continue watching", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.WriteHeader(http.StatusOK)
}

// HandleGetWatchlist renders user's watchlist page, grouped by status.
func (h *Handler) HandleGetWatchlist(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r.Context())
	if user == nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	entries, err := h.service.GetUserWatchlist(r.Context(), user.ID)
	if err != nil {
		log.Printf("failed to fetch watchlist: %v", err)
		if err := templates.GetRenderer().ExecuteTemplate(r.Context(), w, "not_found.gohtml", map[string]any{
			"CurrentPath": r.URL.Path,
		}); err != nil {
			log.Printf("render error: %v", err)
		}
		return
	}

	// group entries by status for display
	watchlistByStatus := make(map[string][]db.GetUserWatchListRow)
	allEntries := make([]db.GetUserWatchListRow, 0)
	watchlistIDs := make([]int64, len(entries))

	for i, entry := range entries {
		status := entry.Status
		if status == "" {
			status = "plan_to_watch"
		}
		watchlistByStatus[status] = append(watchlistByStatus[status], entry)
		allEntries = append(allEntries, entry)
		watchlistIDs[i] = entry.AnimeID
	}

	data := map[string]any{
		"User":              user,
		"CurrentPath":       r.URL.Path,
		"WatchlistByStatus": watchlistByStatus,
		"AllEntries":        allEntries,
		"WatchlistIDs":      watchlistIDs,
		"StatusOrder":       []string{"watching", "plan_to_watch", "on_hold", "completed", "dropped"},
		"StatusLabels": map[string]string{
			"watching":      "Currently Watching",
			"plan_to_watch": "Plan to Watch",
			"on_hold":       "On Hold",
			"completed":     "Completed",
			"dropped":       "Dropped",
		},
	}

	// use partial template for htmx requests
	templateName := "watchlist.gohtml"
	if r.Header.Get("HX-Request") == "true" {
		templateName = "watchlist_partial.gohtml"
	}

	if err := templates.GetRenderer().ExecuteTemplate(r.Context(), w, templateName, data); err != nil {
		log.Printf("render error: %v", err)
	}
}
