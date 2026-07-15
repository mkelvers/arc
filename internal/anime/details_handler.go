package anime

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"mal/integrations/tmdb"
	"mal/internal/domain"
	"mal/internal/server"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	animeSectionTimeout = 12 * time.Second
	audioLookupTimeout  = 8 * time.Second
	episodeCountTimeout = 4 * time.Second
)

type animeReleaseInfoDisplay struct {
	Count  int
	Label  string
	Status string
}

type animeEpisodeDisplay struct {
	Number      int
	Title       string
	SeriesTitle string
	WatchURL    string
	AudioLabel  string
	ImageURL    string
	Duration    string
	AirDate     string
	Overview    string
	Filler      bool
	Recap       bool
}

type animeEpisodeSource struct {
	Anime         domain.Anime
	Episodes      []domain.CanonicalEpisode
	DisplayOffset int
	MediaOffset   int
	WatchAnimeID  int
}

type animeSeasonLink struct {
	Label string
	URL   string
}

type animeSeasonDisplay struct {
	Number   int
	Label    string
	Count    int
	Selected bool
}

type animeEpisodeListDisplay struct {
	AnimeID      int
	Selected     int
	SeasonLabel  string
	Seasons      []animeSeasonDisplay
	Episodes     []animeEpisodeDisplay
	Previous     *animeSeasonLink
	Next         *animeSeasonLink
	EmptyMessage string
}

type animeEpisodeListContext struct {
	Anime      domain.Anime
	Display    animeEpisodeListDisplay
	Mapping    animeMapping
	HasMapping bool
	Season     int
	Mappings   []animeMapping
}

func releasedEpisodeCount(anime domain.Anime, now time.Time) int {
	if !anime.Airing || anime.Aired.From == "" {
		return 0
	}

	firstAired, err := time.Parse(time.RFC3339, anime.Aired.From)
	if err != nil || now.Before(firstAired) {
		return 0
	}

	count := int(now.Sub(firstAired)/(7*24*time.Hour)) + 1
	if anime.Episodes > 0 && count > anime.Episodes {
		return anime.Episodes
	}
	return count
}

func (h *AnimeHandler) animeReleaseInfo(ctx context.Context, anime domain.Anime, now time.Time) animeReleaseInfoDisplay {
	if h.episodeSvc != nil {
		episodeCtx, cancel := context.WithTimeout(ctx, episodeCountTimeout)
		defer cancel()

		episodeList, err := h.episodeSvc.GetCanonicalEpisodes(episodeCtx, anime, false)
		if err == nil {
			return releaseInfoFromCanonical(anime, episodeList)
		} else {
			slog.Warn("anime_episode_availability_count_fetch_failed", "component", "anime", "fields", map[string]any{
				"anime_id": anime.MalID,
			}, "error", err)
		}
	}

	return animeInitialReleaseInfo(anime, now)
}

func releaseInfoFromCanonical(anime domain.Anime, episodeList domain.CanonicalEpisodeList) animeReleaseInfoDisplay {
	info := animeReleaseInfoDisplay{Status: trustedAnimeStatus(anime, len(episodeList.Episodes))}
	if count := len(episodeList.Episodes); count > 0 {
		info.Count = count
		info.Label = canonicalEpisodeCountLabel(episodeList.Source)
	}
	return info
}

func canonicalEpisodeCountLabel(_ string) string {
	return "Available episodes"
}

func animeInitialReleaseInfo(anime domain.Anime, now time.Time) animeReleaseInfoDisplay {
	if isCurrentlyAiring(anime) {
		return animeReleaseInfoDisplay{}
	}

	info := animeReleaseInfoDisplay{Status: strings.TrimSpace(anime.Status)}
	if anime.Episodes > 0 {
		info.Count = anime.Episodes
		info.Label = "Total episodes"
		return info
	}
	if count := releasedEpisodeCount(anime, now); count > 0 {
		info.Count = count
		info.Label = "Estimated aired episodes"
	}
	return info
}

func trustedAnimeStatus(anime domain.Anime, canonicalEpisodes int) string {
	if canonicalEpisodes == 0 && isCurrentlyAiring(anime) {
		return "Not yet aired"
	}
	if status := strings.TrimSpace(anime.Status); status != "" {
		return status
	}
	if anime.Airing {
		return "Currently Airing"
	}
	return ""
}

func isCurrentlyAiring(anime domain.Anime) bool {
	return anime.Airing || strings.EqualFold(strings.TrimSpace(anime.Status), "Currently Airing")
}

func animeAudioAvailabilityLabel(episodes []domain.CanonicalEpisode) string {
	hasKnownSub := false
	for _, episode := range episodes {
		if episode.HasDub {
			return "Dub available"
		}
		if episode.HasSub || episode.SubOnly {
			hasKnownSub = true
		}
	}
	if hasKnownSub {
		return "Subtitled only"
	}
	return ""
}

func (h *AnimeHandler) animeAudioAvailability(ctx context.Context, anime domain.Anime) string {
	if h.episodeSvc == nil {
		return ""
	}

	audioCtx, cancel := context.WithTimeout(ctx, audioLookupTimeout)
	defer cancel()

	episodeList, err := h.episodeSvc.GetCanonicalEpisodes(audioCtx, anime, true)
	if err != nil {
		slog.Warn("anime_audio_availability_fetch_failed", "component", "anime", "fields", map[string]any{
			"anime_id": anime.MalID,
		}, "error", err)

		return ""
	}
	if episodeList.Source != "AllAnime" {
		return ""
	}

	return animeAudioAvailabilityLabel(episodeList.Episodes)
}

func (h *AnimeHandler) animeEpisodeList(ctx context.Context, anime domain.Anime, requestedSeason int) animeEpisodeListDisplay {
	episodeCtx := h.prepareAnimeEpisodeList(ctx, anime, requestedSeason)
	if h.episodeSvc == nil {
		return episodeCtx.Display
	}

	sources := h.episodeSources(ctx, episodeCtx)
	if len(sources) == 0 {
		return episodeCtx.Display
	}

	tmdbEpisodes := h.tmdbSeasonEpisodes(ctx, episodeCtx.Anime, episodeCtx.Mapping, episodeCtx.HasMapping, episodeCtx.Season, &episodeCtx.Display)
	episodeCtx.Display.Episodes = episodeDisplays(sources, tmdbEpisodes)
	return episodeCtx.Display
}

func (h *AnimeHandler) prepareAnimeEpisodeList(ctx context.Context, anime domain.Anime, requestedSeason int) animeEpisodeListContext {
	mapping, hasMapping := h.resolveAnimeTMDBMapping(ctx, anime)
	animeID := anime.MalID
	if hasMapping {
		animeID = h.canonicalWatchAnimeID(ctx, mapping.Group, animeID)
	}
	season := selectedEpisodeSeason(anime, mapping, hasMapping, requestedSeason)
	episodeCtx := animeEpisodeListContext{
		Anime:      anime,
		Mapping:    mapping,
		HasMapping: hasMapping,
		Season:     season,
		Display: animeEpisodeListDisplay{
			AnimeID:      animeID,
			Selected:     season,
			SeasonLabel:  animeSeasonLabel(anime),
			Previous:     animeRelationLink(anime, "PREQUEL", "Previous Season"),
			Next:         animeRelationLink(anime, "SEQUEL", "Next Season"),
			EmptyMessage: "No available episodes found yet.",
		},
	}
	h.applyEpisodeSeasonSelection(ctx, &episodeCtx)
	return episodeCtx
}

func selectedEpisodeSeason(anime domain.Anime, mapping animeMapping, hasMapping bool, requestedSeason int) int {
	if hasMapping && requestedSeason < 0 {
		return anime.SeasonNumber(mapping.Season)
	}
	if requestedSeason >= 0 {
		return requestedSeason
	}
	return fallbackTMDBSeason(anime)
}

func (h *AnimeHandler) applyEpisodeSeasonSelection(ctx context.Context, episodeCtx *animeEpisodeListContext) {
	if episodeCtx == nil || !episodeCtx.HasMapping || episodeCtx.Mapping.Group.MediaType != string(tmdb.MediaTypeTV) {
		return
	}
	plan := h.episodeMappingPlan(ctx, episodeCtx.Mapping.Group)
	h.hydrateTMDBSeasons(ctx, episodeCtx.Mapping.Group, plan, &episodeCtx.Display)
	mappings := mappingsForLogicalSeason(plan, episodeCtx.Season)
	if len(mappings) == 0 {
		return
	}
	episodeCtx.Mappings = mappings
	episodeCtx.Mapping = mappings[0]
	if mappings[0].MALID <= 0 || mappings[0].MALID == episodeCtx.Anime.MalID {
		return
	}
	selectedAnime, err := h.svc.GetAnimeByID(ctx, mappings[0].MALID)
	if err != nil {
		return
	}
	episodeCtx.Anime = selectedAnime
	h.applySelectedAnimeMedia(ctx, &episodeCtx.Anime)
}

func (h *AnimeHandler) episodeSources(ctx context.Context, episodeCtx animeEpisodeListContext) []animeEpisodeSource {
	mappings := episodeCtx.Mappings
	if len(mappings) == 0 {
		mappings = []animeMapping{{MALID: episodeCtx.Anime.MalID}}
	}
	sources := make([]animeEpisodeSource, 0, len(mappings))
	for _, mapping := range mappings {
		sourceAnime, ok := h.episodeSourceAnime(ctx, episodeCtx.Anime, mapping.MALID)
		if !ok {
			continue
		}
		episodeList, err := h.episodeSvc.GetCanonicalEpisodes(ctx, sourceAnime, false)
		if err != nil {
			slog.Warn("anime_episode_list_fetch_failed", "component", "anime", "fields", map[string]any{
				"anime_id": sourceAnime.MalID,
			}, "error", err)
			continue
		}
		watchAnimeID := episodeCtx.Display.AnimeID
		if watchAnimeID <= 0 {
			watchAnimeID = sourceAnime.MalID
		}
		sources = append(sources, animeEpisodeSource{
			Anime:         sourceAnime,
			Episodes:      episodeList.Episodes,
			DisplayOffset: mapping.DisplayOffset,
			MediaOffset:   mapping.MediaOffset,
			WatchAnimeID:  watchAnimeID,
		})
	}
	return sources
}

func (h *AnimeHandler) episodeSourceAnime(ctx context.Context, fallback domain.Anime, malID int) (domain.Anime, bool) {
	if malID <= 0 || malID == fallback.MalID {
		return fallback, true
	}
	anime, err := h.svc.GetAnimeByID(ctx, malID)
	if err != nil {
		return domain.Anime{}, false
	}
	h.applySelectedAnimeMedia(ctx, &anime)
	return anime, true
}

func episodeDisplays(sources []animeEpisodeSource, tmdbEpisodes map[int]tmdb.Episode) []animeEpisodeDisplay {
	total := 0
	for _, source := range sources {
		total += len(source.Episodes)
	}
	episodes := make([]animeEpisodeDisplay, 0, total)
	for _, source := range sources {
		episodes = append(episodes, sourceEpisodeDisplays(source, tmdbEpisodes)...)
	}
	return episodes
}

func sourceEpisodeDisplays(source animeEpisodeSource, tmdbEpisodes map[int]tmdb.Episode) []animeEpisodeDisplay {
	episodes := make([]animeEpisodeDisplay, 0, len(source.Episodes))
	for _, episode := range source.Episodes {
		displayNumber := source.DisplayOffset + episode.Number
		mediaNumber := source.MediaOffset + episode.Number
		media := tmdbEpisodes[mediaNumber]
		episodes = append(episodes, animeEpisodeDisplay{
			Number:      displayNumber,
			Title:       animeEpisodeTitle(episode, media),
			SeriesTitle: source.Anime.DisplayTitle(),
			WatchURL:    fmt.Sprintf("/anime/%d/watch?ep=%d", source.WatchAnimeID, displayNumber),
			AudioLabel:  animeEpisodeAudioLabel(episode),
			ImageURL:    animeEpisodeStillURL(media, source.Anime),
			Duration:    animeEpisodeDuration(media, source.Anime),
			AirDate:     animeEpisodeAirDate(media.AirDate),
			Overview:    media.Overview,
			Filler:      episode.Filler,
			Recap:       episode.Recap,
		})
	}
	return episodes
}

func (h *AnimeHandler) hydrateTMDBSeasons(ctx context.Context, group mappingGroup, plan []animeMapping, display *animeEpisodeListDisplay) {
	if h.tmdbClient == nil || display == nil || group.MediaType != string(tmdb.MediaTypeTV) {
		return
	}
	media, err := h.tmdbClient.GetMedia(ctx, tmdb.MediaRef{Type: tmdb.MediaTypeTV, ID: group.TMDBID}, tmdb.ImageOptions{})
	if err != nil {
		slog.Warn("anime_episode_list_tmdb_seasons_failed", "component", "anime", "fields", map[string]any{
			"tmdb_id": group.TMDBID,
		}, "error", err)
		return
	}
	playbackCounts := playbackEpisodeCountsBySeason(plan)
	display.Seasons = tmdbSeasonDisplays(media.Seasons, playbackCounts, display.Selected)
	display.Seasons = appendSyntheticSeasons(display.Seasons, playbackCounts, display.Selected)
	sort.Slice(display.Seasons, func(i, j int) bool { return display.Seasons[i].Number < display.Seasons[j].Number })
	applySelectedSeasonLabel(display)
}

func applySelectedSeasonLabel(display *animeEpisodeListDisplay) {
	for _, season := range display.Seasons {
		if season.Selected {
			display.SeasonLabel = season.Label
			return
		}
	}
}

func tmdbSeasonDisplays(seasons []tmdb.SeasonSummary, playbackCounts map[int]int, selected int) []animeSeasonDisplay {
	displays := make([]animeSeasonDisplay, 0, len(seasons))
	for _, season := range seasons {
		if season.EpisodeCount <= 0 || season.SeasonNumber < 0 {
			continue
		}
		if season.SeasonNumber == 0 && playbackCounts[0] <= 0 {
			continue
		}
		label := strings.TrimSpace(season.Name)
		if label == "" {
			label = seasonLabelFromNumber(season.SeasonNumber)
		}
		displays = append(displays, animeSeasonDisplay{
			Number:   season.SeasonNumber,
			Label:    label,
			Count:    playbackCounts[season.SeasonNumber],
			Selected: season.SeasonNumber == selected,
		})
	}
	return displays
}

func appendSyntheticSeasons(displays []animeSeasonDisplay, playbackCounts map[int]int, selected int) []animeSeasonDisplay {
	seen := make(map[int]struct{}, len(displays))
	for _, season := range displays {
		seen[season.Number] = struct{}{}
	}
	for season, count := range playbackCounts {
		if season < 0 || count <= 0 {
			continue
		}
		if _, ok := seen[season]; ok {
			continue
		}
		displays = append(displays, animeSeasonDisplay{
			Number: season, Label: seasonLabelFromNumber(season), Count: count, Selected: season == selected,
		})
	}
	return displays
}

func playbackEpisodeCountsBySeason(plan []animeMapping) map[int]int {
	counts := map[int]int{}
	for _, mapping := range plan {
		if mapping.MALID <= 0 || mapping.LogicalSeason < 0 {
			continue
		}
		counts[mapping.LogicalSeason] += mapping.EpisodeCount
	}
	return counts
}

func (h *AnimeHandler) playbackEpisodeCount(ctx context.Context, malID int) int {
	anime, err := h.svc.GetAnimeByID(ctx, malID)
	if err != nil {
		return 0
	}
	episodeList, err := h.episodeSvc.GetCanonicalEpisodes(ctx, anime, false)
	if err != nil {
		return 0
	}
	return len(episodeList.Episodes)
}

func (h *AnimeHandler) canonicalWatchAnimeID(ctx context.Context, group mappingGroup, fallback int) int {
	if h.mappings == nil || group.MediaType == "" || group.TMDBID <= 0 {
		return fallback
	}
	mappings, err := h.mappings.GroupMappings(ctx, group)
	if err != nil {
		return fallback
	}
	canonical := animeMapping{}
	for _, mapping := range mappings {
		if mapping.MALID <= 0 {
			continue
		}
		if canonical.MALID <= 0 || betterCanonical(mapping, canonical) {
			canonical = mapping
		}
	}
	if canonical.MALID > 0 {
		return canonical.MALID
	}
	return fallback
}

func (h *AnimeHandler) episodeMappingPlan(ctx context.Context, group mappingGroup) []animeMapping {
	if h.mappings == nil || group.MediaType == "" || group.TMDBID <= 0 {
		return nil
	}
	mappings, err := h.mappings.GroupMappings(ctx, group)
	if err != nil {
		slog.Warn("anime_episode_list_group_mappings_failed", "component", "anime", "fields", map[string]any{
			"tmdb_media_type": group.MediaType,
			"tmdb_id":         group.TMDBID,
		}, "error", err)
		return nil
	}
	mediaOffsets := map[int]int{}
	plan := make([]animeMapping, 0, len(mappings))
	for _, mapping := range mappings {
		if mapping.MALID <= 0 || mapping.Season < 0 {
			continue
		}
		mapping.LogicalSeason = mapping.Season
		if anime, err := h.svc.GetAnimeByID(ctx, mapping.MALID); err == nil {
			mapping.LogicalSeason = anime.SeasonNumber(mapping.Season)
		}
		mapping.MediaOffset = mediaOffsets[mapping.Season]
		mapping.EpisodeCount = h.playbackEpisodeCount(ctx, mapping.MALID)
		mediaOffsets[mapping.Season] += mapping.EpisodeCount
		plan = append(plan, mapping)
	}
	sort.SliceStable(plan, func(i, j int) bool {
		return plan[i].LogicalSeason < plan[j].LogicalSeason
	})
	displayOffset := 0
	for i := range plan {
		plan[i].DisplayOffset = displayOffset
		displayOffset += plan[i].EpisodeCount
	}
	return plan
}

func mappingsForLogicalSeason(plan []animeMapping, season int) []animeMapping {
	selected := make([]animeMapping, 0, len(plan))
	for _, mapping := range plan {
		if mapping.LogicalSeason == season {
			selected = append(selected, mapping)
		}
	}
	return selected
}

func (h *AnimeHandler) tmdbSeasonEpisodes(ctx context.Context, anime domain.Anime, mapping animeMapping, hasMapping bool, selectedSeason int, display *animeEpisodeListDisplay) map[int]tmdb.Episode {
	if h.tmdbClient == nil || !hasMapping {
		return nil
	}
	if mapping.Group.MediaType != string(tmdb.MediaTypeTV) || selectedSeason < 0 {
		return nil
	}

	season, err := h.tmdbClient.GetSeason(ctx, mapping.Group.TMDBID, mapping.Season, "en-US")
	if err != nil {
		slog.Warn("anime_episode_list_tmdb_season_failed", "component", "anime", "fields", map[string]any{
			"anime_id":    anime.MalID,
			"tmdb_id":     mapping.Group.TMDBID,
			"tmdb_season": mapping.Season,
		}, "error", err)

		return nil
	}

	applyTMDBSeasonLabel(display, mapping.Season, selectedSeason, season.Name)

	episodes := make(map[int]tmdb.Episode, len(season.Episodes))
	for _, episode := range season.Episodes {
		if episode.EpisodeNumber > 0 {
			episodes[episode.EpisodeNumber] = episode
		}
	}
	return episodes
}

func applyTMDBSeasonLabel(display *animeEpisodeListDisplay, mediaSeason int, selectedSeason int, name string) {
	if display == nil || mediaSeason != selectedSeason || strings.TrimSpace(name) == "" {
		return
	}
	display.SeasonLabel = strings.TrimSpace(name)
}

func (h *AnimeHandler) resolveAnimeTMDBMapping(ctx context.Context, anime domain.Anime) (animeMapping, bool) {
	if h.mappings != nil {
		resolved, _, err := h.mappings.Resolve(ctx, []mappingIdentity{{AniListID: anime.AniListID, MALID: anime.MalID}})
		if err != nil {
			slog.Warn("anime_episode_list_mapping_failed", "component", "anime", "fields", map[string]any{
				"anime_id":   anime.MalID,
				"anilist_id": anime.AniListID,
			}, "error", err)
		}
		if mapping, ok := resolved[mappingIdentity{AniListID: anime.AniListID, MALID: anime.MalID}]; ok {
			return mapping, true
		}
	}

	ref, ok := h.searchAnimeTMDBMediaRef(ctx, anime)
	if !ok {
		return animeMapping{}, false
	}
	return animeMapping{
		AniListID: anime.AniListID,
		MALID:     anime.MalID,
		Group:     mappingGroup{MediaType: string(ref.Type), TMDBID: ref.ID},
		Season:    fallbackTMDBSeason(anime),
	}, true
}

func fallbackTMDBSeason(anime domain.Anime) int {
	if strings.EqualFold(strings.TrimSpace(anime.Type), "MOVIE") {
		return -1
	}
	return anime.SeasonNumber(1)
}

func seasonLabelFromNumber(number int) string {
	if number == 0 {
		return "Specials"
	}
	return "Season " + strconv.Itoa(number)
}

func animeEpisodeTitle(episode domain.CanonicalEpisode, media tmdb.Episode) string {
	if strings.TrimSpace(media.Name) != "" {
		return strings.TrimSpace(media.Name)
	}
	if strings.TrimSpace(episode.Title) != "" {
		return strings.TrimSpace(episode.Title)
	}
	return fmt.Sprintf("Episode %d", episode.Number)
}

func animeEpisodeStillURL(media tmdb.Episode, anime domain.Anime) string {
	if url := tmdb.ImageURL(media.StillPath, "w500"); url != "" {
		return url
	}
	return animeEpisodeImageURL(anime)
}

func animeEpisodeDuration(media tmdb.Episode, anime domain.Anime) string {
	if media.Runtime > 0 {
		return strconv.Itoa(media.Runtime) + "m"
	}
	return anime.ShortDuration()
}

func animeEpisodeAirDate(value string) string {
	date, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return strings.TrimSpace(value)
	}
	return date.Format("01/02/2006")
}

func animeEpisodeImageURL(anime domain.Anime) string {
	if anime.BannerImageURL != "" {
		return anime.BannerImageURL
	}
	if anime.Images.Webp.LargeImageURL != "" {
		return anime.Images.Webp.LargeImageURL
	}
	return anime.Images.Jpg.LargeImageURL
}

func animeEpisodeAudioLabel(episode domain.CanonicalEpisode) string {
	if episode.Number <= 0 {
		return ""
	}
	switch {
	case episode.HasDub && (episode.HasSub || episode.SubOnly):
		return "Dub | Sub"
	case episode.HasDub:
		return "Dub"
	case episode.HasSub || episode.SubOnly:
		return "Subtitled"
	default:
		return "Available"
	}
}

func animeSeasonLabel(anime domain.Anime) string {
	if season := anime.SeasonNumber(0); season > 0 {
		return seasonLabelFromNumber(season)
	}

	switch strings.ToUpper(strings.TrimSpace(anime.Type)) {
	case "OVA", "ONA":
		return anime.Type + " Season 1"
	case "SPECIAL":
		return "Specials"
	case "MOVIE":
		return "Movie"
	case "TV", "TV_SHORT":
		return "Season"
	default:
		return "Episodes"
	}
}

func animeRelationLink(anime domain.Anime, relationType string, label string) *animeSeasonLink {
	for _, relation := range anime.ProviderRelations {
		if relation.MALID <= 0 || !strings.EqualFold(relation.Type, relationType) {
			continue
		}
		return &animeSeasonLink{Label: label, URL: fmt.Sprintf("/anime/%d", relation.MALID)}
	}
	return nil
}

func (h *AnimeHandler) HandleAnimeDetails(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}

	section := c.Query("section")
	if section != "" && c.GetHeader("HX-Request") == "true" {
		h.handleAnimeDetailsSection(c, id, section)
		return
	}

	anime, err := h.svc.GetAnimeByID(c.Request.Context(), id)
	if err != nil {
		server.RespondNotFound(c)
		return
	}
	h.applySelectedAnimeMedia(c.Request.Context(), &anime)

	h.svc.WarmDetailSections(id)

	user := server.CurrentUser(c)
	status := ""
	var watchlistIDs []int64
	ep := 0
	var cwSeconds float64
	if user != nil {
		entry, err := h.watchlistSvc.GetWatchListEntry(c.Request.Context(), user.ID, int64(id))
		if err == nil {
			status = entry.Status
			watchlistIDs = []int64{entry.AnimeID}
		}

		cwEntry, err := h.watchlistSvc.GetContinueWatchingEntry(c.Request.Context(), user.ID, int64(id))
		if err == nil && cwEntry.CurrentEpisode.Valid {
			ep = int(cwEntry.CurrentEpisode.Int64)
			cwSeconds = cwEntry.CurrentTimeSeconds
		}
	}

	releaseInfo := animeInitialReleaseInfo(anime, time.Now())

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"Anime":                anime,
		"CurrentPath":          fmt.Sprintf("/anime/%d", id),
		"User":                 user,
		"Status":               status,
		"WatchlistIDs":         watchlistIDs,
		"ContinueWatchingEp":   ep,
		"ContinueWatchingTime": cwSeconds,
		"ReleaseInfo":          releaseInfo,
	})
}

func (h *AnimeHandler) handleAnimeDetailsSection(c *gin.Context, id int, section string) {
	sectionCtx, cancel := context.WithTimeout(c.Request.Context(), animeSectionTimeout)
	defer cancel()

	data, tplName, err := h.loadAnimeDetailsSection(sectionCtx, id, section, parseSelectedSeason(c.Query("season")))
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		slog.Warn("anime_section_fetch_failed", "component", "anime", "fields", map[string]any{
			"section":  section,
			"anime_id": id,
		}, "error", err)

		if section == "recommendations" {
			c.HTML(http.StatusOK, "anime.gohtml", gin.H{
				"_fragment": "anime_recommendations_loading",
				"AnimeID":   id,
			})
			return
		}
		c.Status(http.StatusNoContent)
		return
	}

	c.HTML(http.StatusOK, "anime.gohtml", gin.H{
		"_fragment": tplName,
		"Items":     data,
	})
}

func (h *AnimeHandler) loadAnimeDetailsSection(ctx context.Context, id int, section string, selectedSeason int) (any, string, error) {
	switch section {
	case "characters":
		data, err := h.svc.GetCharacters(ctx, id)
		return data, "anime_characters", err
	case "recommendations":
		data, err := h.svc.GetRecommendations(ctx, id)
		return data, "anime_recommendations", err
	case "episode-count", "release-info":
		anime, err := h.svc.GetAnimeByID(ctx, id)
		if err != nil {
			return nil, "", err
		}
		return h.animeReleaseInfo(ctx, anime, time.Now()), "anime_release_info", nil
	case "audio-availability":
		anime, err := h.svc.GetAnimeByID(ctx, id)
		if err != nil {
			return nil, "", err
		}
		return h.animeAudioAvailability(ctx, anime), "anime_audio_availability", nil
	case "episode-list":
		anime, err := h.svc.GetAnimeByID(ctx, id)
		if err != nil {
			return nil, "", err
		}
		h.applySelectedAnimeMedia(ctx, &anime)
		return h.animeEpisodeList(ctx, anime, selectedSeason), "anime_episode_list", nil
	default:
		return nil, "", nil
	}
}

func parseSelectedSeason(raw string) int {
	if strings.TrimSpace(raw) == "" {
		return -1
	}
	season, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return -1
	}
	return season
}
