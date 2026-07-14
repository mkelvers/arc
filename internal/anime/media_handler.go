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

	ref, ok, err := h.tmdbMediaRef(c.Request.Context(), anime.AniListID, anime.MalID)
	if err != nil {
		slog.Warn("anime_media_mapping_failed", "component", "anime", "fields", map[string]any{
			"anime_id":   anime.MalID,
			"anilist_id": anime.AniListID,
		}, "error", err)
		c.HTML(http.StatusOK, "anime_media.gohtml", animeMediaPageData(c, anime, "", nil, nil, nil, "Could not resolve media mapping."))
		return
	}
	if !ok {
		c.HTML(http.StatusOK, "anime_media.gohtml", animeMediaPageData(c, anime, "", nil, nil, nil, "No TMDB media mapping found."))
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

	selections, err := h.mappings.MediaSelections(c.Request.Context(), anime.MalID)
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
	anime, ref, kind, filePath, ok := h.selectedMediaRequest(c)
	if !ok {
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

func (h *AnimeHandler) selectedMediaRequest(c *gin.Context) (domain.Anime, tmdb.MediaRef, string, string, bool) {
	id, ok := parsePositiveAnimeID(c)
	if !ok {
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false
	}

	kind, filePath, ok := selectedMediaForm(c)
	if !ok {
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false
	}

	anime, err := h.svc.GetAnimeByID(c.Request.Context(), id)
	if err != nil {
		server.RespondNotFound(c)
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false
	}

	ref, ok := h.selectedMediaRef(c, anime)
	if !ok {
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false
	}

	if !h.validSelectedMediaPath(c, anime, ref, kind, filePath) {
		return domain.Anime{}, tmdb.MediaRef{}, "", "", false
	}

	return anime, ref, kind, filePath, true
}

func parsePositiveAnimeID(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return 0, false
	}
	return id, true
}

func selectedMediaForm(c *gin.Context) (string, string, bool) {
	kind := normalizeMediaSelectionKind(c.PostForm("kind"))
	if !validMediaSelectionKind(kind) {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid media kind")
		return "", "", false
	}

	filePath := strings.TrimSpace(c.PostForm("file_path"))
	if filePath == "" {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "missing media file path")
		return "", "", false
	}
	return kind, filePath, true
}

func (h *AnimeHandler) selectedMediaRef(c *gin.Context, anime domain.Anime) (tmdb.MediaRef, bool) {
	ref, ok, err := h.tmdbMediaRef(c.Request.Context(), anime.AniListID, anime.MalID)
	if err != nil {
		slog.Warn("anime_media_select_mapping_failed", "component", "anime", "fields", map[string]any{
			"anime_id":   anime.MalID,
			"anilist_id": anime.AniListID,
		}, "error", err)
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "could not resolve media mapping")
		return tmdb.MediaRef{}, false
	}
	if !ok {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "no TMDB media mapping found")
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
	resolved, _, err := h.mappings.Resolve(ctx, []mappingIdentity{{AniListID: anilistID, MALID: malID}})
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

func (h *AnimeHandler) applySelectedAnimeMedia(ctx context.Context, anime *domain.Anime) {
	if anime == nil || anime.MalID <= 0 {
		return
	}
	selections, err := h.mappings.MediaSelections(ctx, anime.MalID)
	if err != nil {
		slog.Warn("anime_selected_media_load_failed", "component", "anime", "fields", map[string]any{
			"anime_id": anime.MalID,
		}, "error", err)
		return
	}
	if selection, ok := selections[mediaSelectionBackdrop]; ok {
		if url := tmdb.ImageURL(selection.FilePath, "original"); url != "" {
			anime.BannerImageURL = url
		}
	}
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
