package anime

import (
	"context"
	"fmt"
	"log/slog"
	"mal/integrations/tmdb"
	"mal/internal/domain"
	"mal/internal/server"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type animeMediaImage struct {
	URL       string
	FullURL   string
	FilePath  string
	Width     int
	Height    int
	Language  string
	VoteCount int
}

func (h *AnimeHandler) HandleAnimeMedia(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	anime, err := h.svc.GetAnimeByID(c.Request.Context(), id)
	if err != nil {
		server.RespondNotFound(c)
		return
	}
	h.applySelectedAnimeMedia(c.Request.Context(), &anime)

	ref, ok := h.resolveAnimeTMDBMediaRef(c.Request.Context(), anime)
	if !ok {
		c.HTML(http.StatusOK, "anime_media.gohtml", animeMediaPageData(c, anime, "", nil, nil, nil, "No TMDB media found."))
		return
	}

	images, err := h.tmdbClient.GetImages(c.Request.Context(), ref, tmdb.ImageOptions{})
	if err != nil {
		slog.Warn("anime_media_tmdb_fetch_failed", "component", "anime", "fields", map[string]any{
			"anime_id":        anime.MalID,
			"tmdb_media_type": ref.Type,
			"tmdb_id":         ref.ID,
		}, "error", err)
		c.HTML(http.StatusOK, "anime_media.gohtml", animeMediaPageData(c, anime, tmdbLabel(ref), nil, nil, nil, "Could not load TMDB media."))
		return
	}

	selections, err := h.mappings.MediaSelectionsForRef(c.Request.Context(), ref)
	if err != nil {
		slog.Warn("anime_media_selection_load_failed", "component", "anime", "fields", map[string]any{
			"anime_id": anime.MalID,
		}, "error", err)
	}

	c.HTML(http.StatusOK, "anime_media.gohtml", animeMediaPageData(
		c,
		anime,
		tmdbLabel(ref),
		tmdbMediaImages(images.Backdrops, "w780"),
		tmdbMediaImages(images.Logos, "w500"),
		selections,
		"",
	))
}

func (h *AnimeHandler) HandleSelectAnimeMedia(c *gin.Context) {
	anime, ref, kind, filePath, unselect, ok := h.selectedMediaRequest(c)
	if !ok {
		return
	}

	if unselect {
		ref, mapped := h.resolveAnimeTMDBMediaRef(c.Request.Context(), anime)
		if !mapped {
			server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "no TMDB media found")
			return
		}
		if err := h.mappings.DeleteMediaSelectionForRef(c.Request.Context(), ref, kind); err != nil {
			slog.Warn("anime_media_select_delete_failed", "component", "anime", "fields", map[string]any{
				"anime_id": anime.MalID,
				"kind":     kind,
			}, "error", err)
			server.RespondHTMLOrJSONError(c, http.StatusInternalServerError, "could not delete media selection")
			return
		}
		c.Redirect(http.StatusSeeOther, fmt.Sprintf("/anime/%d/media?kind=%s", anime.MalID, mediaQueryKind(kind)))
		return
	}

	if err := h.mappings.SaveMediaSelection(c.Request.Context(), anime.MalID, kind, ref, filePath); err != nil {
		slog.Warn("anime_media_select_save_failed", "component", "anime", "fields", map[string]any{
			"anime_id": anime.MalID,
			"kind":     kind,
		}, "error", err)
		server.RespondHTMLOrJSONError(c, http.StatusInternalServerError, "could not save media selection")
		return
	}

	c.Redirect(http.StatusSeeOther, fmt.Sprintf("/anime/%d/media?kind=%s", anime.MalID, mediaQueryKind(kind)))
}

func (h *AnimeHandler) selectedMediaRequest(c *gin.Context) (domain.Anime, tmdb.MediaRef, string, string, bool, bool) {
	id, ok := parsePositiveAnimeID(c)
	if !ok {
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false, false
	}

	kind, filePath, unselect, ok := selectedMediaForm(c)
	if !ok {
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false, false
	}

	anime, err := h.svc.GetAnimeByID(c.Request.Context(), id)
	if err != nil {
		server.RespondNotFound(c)
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false, false
	}

	if unselect {
		return anime, tmdb.MediaRef{}, kind, "", true, true
	}

	ref, ok := h.selectedMediaRef(c, anime)
	if !ok {
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false, false
	}

	if !h.validSelectedMediaPath(c, anime, ref, kind, filePath) {
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false, false
	}

	return anime, ref, kind, filePath, false, true
}

func parsePositiveAnimeID(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return 0, false
	}
	return id, true
}

func selectedMediaForm(c *gin.Context) (string, string, bool, bool) {
	kind := normalizeMediaSelectionKind(c.PostForm("kind"))
	if !validMediaSelectionKind(kind) {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid media kind")
		return "", "", false, false
	}

	unselect := strings.EqualFold(strings.TrimSpace(c.PostForm("action")), "unselect")
	filePath := strings.TrimSpace(c.PostForm("file_path"))
	if filePath == "" && !unselect {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "missing media file path")
		return "", "", false, false
	}
	return kind, filePath, unselect, true
}

func (h *AnimeHandler) selectedMediaRef(c *gin.Context, anime domain.Anime) (tmdb.MediaRef, bool) {
	ref, ok := h.resolveAnimeTMDBMediaRef(c.Request.Context(), anime)
	if !ok {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "no TMDB media found")
		return tmdb.MediaRef{}, false
	}
	return ref, true
}

func (h *AnimeHandler) validSelectedMediaPath(c *gin.Context, anime domain.Anime, ref tmdb.MediaRef, kind string, filePath string) bool {
	images, err := h.tmdbClient.GetImages(c.Request.Context(), ref, tmdb.ImageOptions{})
	if err != nil {
		slog.Warn("anime_media_select_tmdb_fetch_failed", "component", "anime", "fields", map[string]any{
			"anime_id":        anime.MalID,
			"tmdb_media_type": ref.Type,
			"tmdb_id":         ref.ID,
		}, "error", err)
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "could not load TMDB media")
		return false
	}
	if !tmdbImagePathExists(imagesForSelectionKind(images, kind), filePath) {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "media file path is not valid for this anime")
		return false
	}
	return true
}

func (h *AnimeHandler) tmdbMediaRef(ctx context.Context, anilistID int, malID int) (tmdb.MediaRef, bool, error) {
	resolved, err := h.mappings.Resolve(ctx, []mappingIdentity{{AniListID: anilistID, MALID: malID}})
	if err != nil {
		return tmdb.MediaRef{}, false, err
	}
	mapping, ok := resolved[mappingIdentity{AniListID: anilistID, MALID: malID}]
	if !ok {
		return tmdb.MediaRef{}, false, nil
	}
	return tmdb.MediaRef{
		Type: tmdb.MediaType(mapping.Group.MediaType),
		ID:   mapping.Group.TMDBID,
	}, true, nil
}

func (h *AnimeHandler) resolveAnimeTMDBMediaRef(ctx context.Context, anime domain.Anime) (tmdb.MediaRef, bool) {
	if h.mappings != nil {
		ref, ok, err := h.tmdbMediaRef(ctx, anime.AniListID, anime.MalID)
		if err != nil {
			slog.Warn("anime_media_mapping_failed", "component", "anime", "fields", map[string]any{
				"anime_id":   anime.MalID,
				"anilist_id": anime.AniListID,
			}, "error", err)
		}
		if ok {
			return ref, true
		}
	}
	return h.searchAnimeTMDBMediaRef(ctx, anime)
}

func (h *AnimeHandler) searchAnimeTMDBMediaRef(ctx context.Context, anime domain.Anime) (tmdb.MediaRef, bool) {
	if h.tmdbClient == nil {
		return tmdb.MediaRef{}, false
	}
	for _, mediaType := range tmdbSearchMediaTypes(anime.Type) {
		for _, title := range tmdbSearchTitles(anime) {
			for _, year := range tmdbSearchYears(anime.Year) {
				results, err := h.tmdbClient.Search(ctx, mediaType, title, year)
				if err != nil {
					slog.Warn("anime_tmdb_media_search_failed", "component", "anime", "fields", map[string]any{
						"anime_id":        anime.MalID,
						"tmdb_media_type": mediaType,
						"title":           title,
						"year":            year,
					}, "error", err)
					continue
				}
				for _, result := range results {
					if result.ID > 0 {
						return tmdb.MediaRef{Type: result.Type, ID: result.ID}, true
					}
				}
			}
		}
	}
	return tmdb.MediaRef{}, false
}

func (h *AnimeHandler) applySelectedAnimeMedia(ctx context.Context, anime *domain.Anime) {
	if anime == nil || anime.MalID <= 0 {
		return
	}
	var selections map[string]mediaSelection
	if h.mappings != nil {
		var err error
		if ref, ok := h.resolveAnimeTMDBMediaRef(ctx, *anime); ok {
			selections, err = h.mappings.MediaSelectionsForRef(ctx, ref)
		} else {
			selections, err = h.mappings.MediaSelections(ctx, anime.MalID)
		}
		if err != nil {
			slog.Warn("anime_selected_media_load_failed", "component", "anime", "fields", map[string]any{
				"anime_id": anime.MalID,
			}, "error", err)
		}
	}
	if selection, ok := selections[mediaSelectionBackdrop]; ok {
		if url := tmdb.ImageURL(selection.FilePath, "original"); url != "" {
			anime.BannerImageURL = url
		}
	}
	if selection, ok := selections[mediaSelectionLogo]; ok {
		if url := tmdb.ImageURL(selection.FilePath, "original"); url != "" {
			anime.LogoImageURL = url
		}
	}
}

func tmdbSearchMediaTypes(animeType string) []tmdb.MediaType {
	switch strings.ToLower(strings.TrimSpace(animeType)) {
	case "movie":
		return []tmdb.MediaType{tmdb.MediaTypeMovie, tmdb.MediaTypeTV}
	case "tv", "ova", "ona", "special":
		return []tmdb.MediaType{tmdb.MediaTypeTV, tmdb.MediaTypeMovie}
	default:
		return []tmdb.MediaType{tmdb.MediaTypeTV, tmdb.MediaTypeMovie}
	}
}

func tmdbSearchYears(year int) []int {
	if year <= 0 {
		return []int{0}
	}
	return []int{year, 0}
}

func tmdbSearchTitles(anime domain.Anime) []string {
	candidates := make([]string, 0, 4+len(anime.TitleSynonyms))
	candidates = append(candidates, anime.DisplayTitle(), anime.Title, anime.TitleEnglish, anime.TitleJapanese)
	candidates = append(candidates, anime.TitleSynonyms...)
	titles := make([]string, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		key := strings.ToLower(candidate)
		if candidate == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		titles = append(titles, candidate)
	}
	return titles
}

func animeMediaPageData(c *gin.Context, anime any, tmdbLabel string, backdrops []animeMediaImage, logos []animeMediaImage, selections map[string]mediaSelection, loadError string) map[string]any {
	return map[string]any{
		"Anime":                anime,
		"CurrentPath":          c.Request.URL.Path,
		"User":                 server.CurrentUser(c),
		"TMDBLabel":            tmdbLabel,
		"Backdrops":            backdrops,
		"Logos":                logos,
		"ActiveKind":           activeMediaKind(c.Query("kind")),
		"SelectedBackdropPath": selectedMediaPath(selections, mediaSelectionBackdrop),
		"SelectedLogoPath":     selectedMediaPath(selections, mediaSelectionLogo),
		"LoadError":            loadError,
	}
}

func tmdbMediaImages(images []tmdb.Image, size string) []animeMediaImage {
	result := make([]animeMediaImage, 0, len(images))
	for _, image := range images {
		url := tmdb.ImageURL(image.FilePath, size)
		if url == "" {
			continue
		}
		result = append(result, animeMediaImage{
			URL:       url,
			FullURL:   tmdb.ImageURL(image.FilePath, "original"),
			FilePath:  image.FilePath,
			Width:     image.Width,
			Height:    image.Height,
			Language:  image.Language,
			VoteCount: image.VoteCount,
		})
	}
	return result
}

func imagesForSelectionKind(images tmdb.Images, kind string) []tmdb.Image {
	if kind == mediaSelectionLogo {
		return images.Logos
	}
	return images.Backdrops
}

func tmdbImagePathExists(images []tmdb.Image, filePath string) bool {
	for _, image := range images {
		if image.FilePath == filePath {
			return true
		}
	}
	return false
}

func selectedMediaPath(selections map[string]mediaSelection, kind string) string {
	if selections == nil {
		return ""
	}
	return selections[kind].FilePath
}

func normalizeMediaSelectionKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "logos", mediaSelectionLogo:
		return mediaSelectionLogo
	default:
		return mediaSelectionBackdrop
	}
}

func mediaQueryKind(kind string) string {
	if kind == mediaSelectionLogo {
		return "logos"
	}
	return "backdrops"
}

func activeMediaKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "logos":
		return "logos"
	default:
		return "backdrops"
	}
}

func tmdbLabel(ref tmdb.MediaRef) string {
	return fmt.Sprintf("TMDB %s #%d", ref.Type, ref.ID)
}
