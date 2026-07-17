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
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

const (
	animeSectionTimeout = 12 * time.Second
	tmdbMetadataTimeout = 6 * time.Second
	tmdbMetadataWorkers = 6
	episodePlanTimeout  = 2 * time.Second
	audioLookupTimeout  = 8 * time.Second
	episodeCountTimeout = 4 * time.Second
	ovaSeasonBase       = 1000
	bonusSeason         = 2000
	episodeKindRegular  = "regular"
	episodeKindInline   = "inline-special"
	episodeKindOVA      = "ova"
	episodeKindShorts   = "shorts"
	episodeKindBonus    = "bonus"
)

type animeReleaseInfoDisplay struct {
	Count  int
	Label  string
	Status string
}

type animeEpisodeDisplay struct {
	Number      int
	Label       string
	Order       int
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
	EpisodeMin    int
	EpisodeMax    int
	Kind          string
}

type animeEpisodeListDisplay struct {
	AnimeID      int
	SeasonLabel  string
	Episodes     []animeEpisodeDisplay
	EmptyMessage string
}

type animeEpisodeListContext struct {
	Anime      domain.Anime
	Display    animeEpisodeListDisplay
	Mapping    animeMapping
	HasMapping bool
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

func (h *AnimeHandler) animeEpisodeList(ctx context.Context, anime domain.Anime) animeEpisodeListDisplay {
	episodeCtx := h.prepareAnimeEpisodeList(ctx, anime)
	if h.episodeSvc == nil {
		return episodeCtx.Display
	}

	sources := h.episodeSources(ctx, episodeCtx)
	if len(sources) == 0 {
		return episodeCtx.Display
	}

	mappings, sources := h.extendReleaseMappings(ctx, episodeCtx.Mappings, sources)
	tmdbEpisodes := h.tmdbReleaseEpisodes(ctx, episodeCtx.Anime, mappings, sources)
	episodeCtx.Display.Episodes = episodeDisplays(sources, tmdbEpisodes)
	disambiguateSpecialEpisodeOrders(episodeCtx.Display.Episodes, mappings, 0)
	return episodeCtx.Display
}

func (h *AnimeHandler) prepareAnimeEpisodeList(ctx context.Context, anime domain.Anime) animeEpisodeListContext {
	mapping, hasMapping := h.resolveAnimeTMDBMapping(ctx, anime)
	episodeCtx := animeEpisodeListContext{
		Anime:      anime,
		Mapping:    mapping,
		HasMapping: hasMapping,
		Display: animeEpisodeListDisplay{
			AnimeID:      anime.MalID,
			SeasonLabel:  animeSeasonLabel(anime),
			EmptyMessage: "No available episodes found yet.",
		},
	}
	episodeCtx.Mappings = h.releaseEpisodeMappings(ctx, anime, mapping, hasMapping)
	return episodeCtx
}

func (h *AnimeHandler) releaseEpisodeMappings(ctx context.Context, anime domain.Anime, mapping animeMapping, hasMapping bool) []animeMapping {
	if !hasMapping {
		return []animeMapping{{AniListID: anime.AniListID, MALID: anime.MalID, Kind: releaseEpisodeKind(anime, mapping)}}
	}
	mappings := h.expandEpisodeMappingSegments(ctx, mapping.Group, []animeMapping{mapping})
	for index := range mappings {
		mappings[index].MALID = anime.MalID
		mappings[index].AniListID = anime.AniListID
		mappings[index].DisplayOffset = 0
		mappings[index].MediaOffset = 0
		mappings[index].Kind = releaseEpisodeKind(anime, mappings[index])
	}
	return mappings
}

func releaseEpisodeKind(anime domain.Anime, mapping animeMapping) string {
	switch strings.ToUpper(strings.TrimSpace(anime.Type)) {
	case "OVA", "SPECIAL":
		return episodeKindOVA
	case "TV":
		return episodeKindRegular
	case "ONA":
		if mapping.Season > 0 {
			return episodeKindRegular
		}
	}
	if mapping.Season == 0 {
		return episodeKindOVA
	}
	return episodeKindRegular
}

func (h *AnimeHandler) episodeSources(ctx context.Context, episodeCtx animeEpisodeListContext) []animeEpisodeSource {
	mappings := episodeCtx.Mappings
	if len(mappings) == 0 {
		mappings = []animeMapping{{MALID: episodeCtx.Anime.MalID}}
	}
	sources := make([]animeEpisodeSource, len(mappings))
	available := make([]bool, len(mappings))
	var group errgroup.Group
	for index, mapping := range mappings {
		group.Go(func() error {
			source, ok := h.episodeSource(ctx, episodeCtx, mapping)
			if ok {
				sources[index] = source
				available[index] = true
			}
			return nil
		})
	}
	_ = group.Wait()
	playable := make([]animeEpisodeSource, 0, len(sources))
	for index, source := range sources {
		if available[index] {
			playable = append(playable, source)
		}
	}
	return playable
}

func (h *AnimeHandler) episodeSource(ctx context.Context, episodeCtx animeEpisodeListContext, mapping animeMapping) (animeEpisodeSource, bool) {
	sourceAnime, ok := h.episodeSourceAnime(ctx, episodeCtx.Anime, mapping.MALID)
	if !ok {
		return animeEpisodeSource{}, false
	}
	episodeList, err := h.episodeSvc.GetCanonicalEpisodes(ctx, sourceAnime, false)
	if err != nil {
		slog.Warn("anime_episode_list_fetch_failed", "component", "anime", "fields", map[string]any{
			"anime_id": sourceAnime.MalID,
		}, "error", err)
		return animeEpisodeSource{}, false
	}
	watchAnimeID := episodeCtx.Display.AnimeID
	if watchAnimeID <= 0 {
		watchAnimeID = sourceAnime.MalID
	}
	kind := mapping.Kind
	if kind == "" {
		kind = episodeKindRegular
	}
	return animeEpisodeSource{
		Anime:         sourceAnime,
		Episodes:      episodeList.Episodes,
		DisplayOffset: mapping.DisplayOffset,
		MediaOffset:   mapping.MediaOffset,
		WatchAnimeID:  watchAnimeID,
		EpisodeMin:    mapping.EpisodeMin,
		EpisodeMax:    mapping.EpisodeMax,
		Kind:          kind,
	}, true
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
	sort.SliceStable(episodes, func(i, j int) bool { return episodes[i].Order < episodes[j].Order })
	return episodes
}

func (h *AnimeHandler) extendReleaseMappings(ctx context.Context, mappings []animeMapping, sources []animeEpisodeSource) ([]animeMapping, []animeEpisodeSource) {
	extensions := h.tmdbContinuationMappings(ctx, mappings, sourceMaxRegularEpisode(sources))
	if len(extensions) == 0 {
		return mappings, sources
	}
	extendedMappings := append(append([]animeMapping(nil), mappings...), extensions...)
	extendedSources := append(append([]animeEpisodeSource(nil), sources...), continuationEpisodeSources(sources, extensions)...)
	return extendedMappings, extendedSources
}

func sourceMaxRegularEpisode(sources []animeEpisodeSource) int {
	maxEpisode := 0
	for _, source := range sources {
		for _, episode := range source.Episodes {
			if !episode.Special && episode.Number > maxEpisode {
				maxEpisode = episode.Number
			}
		}
	}
	return maxEpisode
}

func continuationEpisodeSources(sources []animeEpisodeSource, mappings []animeMapping) []animeEpisodeSource {
	out := make([]animeEpisodeSource, 0, len(mappings))
	for _, mapping := range mappings {
		source, ok := continuationEpisodeSource(sources, mapping)
		if ok {
			out = append(out, source)
		}
	}
	return out
}

func continuationEpisodeSource(sources []animeEpisodeSource, mapping animeMapping) (animeEpisodeSource, bool) {
	for _, source := range sources {
		if source.Anime.MalID != mapping.MALID {
			continue
		}
		source.DisplayOffset = mapping.DisplayOffset
		source.MediaOffset = mapping.MediaOffset
		source.EpisodeMin = mapping.EpisodeMin
		source.EpisodeMax = mapping.EpisodeMax
		source.Kind = mapping.Kind
		return source, true
	}
	return animeEpisodeSource{}, false
}

func disambiguateSpecialEpisodeOrders(episodes []animeEpisodeDisplay, plan []animeMapping, selectedSeason int) {
	occupied := map[int]bool{}
	for _, mapping := range plan {
		if mapping.Kind == episodeKindInline && mapping.LogicalSeason < selectedSeason {
			occupied[mapping.DisplayOffset*10+5] = true
		}
	}
	for i := range episodes {
		if episodes[i].Order%10 == 0 {
			continue
		}
		order := episodes[i].Order
		for occupied[order] && (order+1)%10 != 0 {
			order++
		}
		episodes[i].Order = order
		episodes[i].Number = order / 10
		episodes[i].Label = "E" + episodeOrderLabel(order)
		occupied[order] = true
	}
}

func sourceEpisodeDisplays(source animeEpisodeSource, tmdbEpisodes map[int]tmdb.Episode) []animeEpisodeDisplay {
	if source.Kind == "" {
		source.Kind = episodeKindRegular
	}
	source.Episodes = episodesWithinSourceBounds(source.Episodes, source.EpisodeMin, source.EpisodeMax)
	if source.Kind == episodeKindBonus {
		return bonusEpisodeDisplays(source, tmdbEpisodes)
	}
	episodes := make([]animeEpisodeDisplay, 0, len(source.Episodes))
	specialMedia := ovaTMDBEpisodeMatches(source, tmdbEpisodes)
	for _, episode := range source.Episodes {
		sourceOrder := episode.SortOrder()
		displayOrder := sourceOrder
		displayNumber := displayOrder / 10
		mediaNumber := source.MediaOffset + episode.Number
		media := tmdbEpisodes[mediaNumber]
		watchAnimeID := source.WatchAnimeID
		watchEpisode := strconv.Itoa(displayNumber)
		if source.Kind == episodeKindInline {
			displayOrder = source.DisplayOffset*10 + 5
			displayNumber = source.DisplayOffset
		}
		if episode.Special || source.Kind != episodeKindRegular {
			watchAnimeID = source.Anime.MalID
			watchEpisode = episode.PlaybackID()
			if source.Kind == episodeKindOVA || source.Kind == episodeKindShorts {
				media = specialMedia[episode.PlaybackID()]
			} else {
				media = matchingTMDBEpisodeForSource(tmdbEpisodes, source.MediaOffset, episode)
			}
		}
		episodes = append(episodes, animeEpisodeDisplay{
			Number:      displayNumber,
			Label:       "E" + episodeOrderLabel(displayOrder),
			Order:       displayOrder,
			Title:       animeEpisodeTitle(episode, media),
			SeriesTitle: source.Anime.DisplayTitle(),
			WatchURL:    fmt.Sprintf("/anime/%d/watch?ep=%s", watchAnimeID, url.QueryEscape(watchEpisode)),
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

func episodesWithinSourceBounds(episodes []domain.CanonicalEpisode, minEpisode int, maxEpisode int) []domain.CanonicalEpisode {
	if minEpisode <= 0 && maxEpisode <= 0 {
		return episodes
	}
	filtered := make([]domain.CanonicalEpisode, 0, len(episodes))
	for _, episode := range episodes {
		if episodeWithinSourceBounds(episode, minEpisode, maxEpisode) {
			filtered = append(filtered, episode)
		}
	}
	return filtered
}

func episodeWithinSourceBounds(episode domain.CanonicalEpisode, minEpisode int, maxEpisode int) bool {
	if episode.Special && episode.Number == 0 && minEpisode == 1 {
		return true
	}
	if minEpisode > 0 && episode.Number < minEpisode {
		return false
	}
	return maxEpisode <= 0 || episode.Number <= maxEpisode
}

func bonusEpisodeDisplays(source animeEpisodeSource, tmdbEpisodes map[int]tmdb.Episode) []animeEpisodeDisplay {
	episodes := make([]animeEpisodeDisplay, 0, len(source.Episodes))
	seenMedia := map[int64]int{}
	sequenceMedia := ovaTMDBEpisodeMatches(source, tmdbEpisodes)
	for index, episode := range source.Episodes {
		media := sequenceMedia[episode.PlaybackID()]
		if media.ID <= 0 {
			media = matchingTMDBEpisode(tmdbEpisodes, episode.Title)
		}
		if media.SeasonNumber != 0 {
			media = tmdb.Episode{}
		}
		if existing, duplicate := seenMedia[media.ID]; media.ID > 0 && duplicate {
			mergeBonusAudio(&episodes[existing], episode)
			continue
		}
		displayNumber := index + 1
		if source.Kind == episodeKindBonus && media.EpisodeNumber > 0 {
			displayNumber = media.EpisodeNumber
		}
		episodes = append(episodes, animeEpisodeDisplay{
			Number:      displayNumber,
			Label:       "E" + strconv.Itoa(displayNumber),
			Order:       displayNumber * 10,
			Title:       animeEpisodeTitle(episode, media),
			SeriesTitle: source.Anime.DisplayTitle(),
			WatchURL:    fmt.Sprintf("/anime/%d/watch?ep=%s", source.Anime.MalID, url.QueryEscape(episode.PlaybackID())),
			AudioLabel:  animeEpisodeAudioLabel(episode),
			ImageURL:    animeEpisodeStillURL(media, source.Anime),
			Duration:    animeEpisodeDuration(media, source.Anime),
			AirDate:     animeEpisodeAirDate(media.AirDate),
			Overview:    media.Overview,
			Filler:      episode.Filler,
			Recap:       episode.Recap,
		})
		if media.ID > 0 {
			seenMedia[media.ID] = len(episodes) - 1
		}
	}
	return episodes
}

func mergeBonusAudio(display *animeEpisodeDisplay, episode domain.CanonicalEpisode) {
	if display == nil {
		return
	}
	current := domain.CanonicalEpisode{HasDub: strings.Contains(display.AudioLabel, "Dub"), HasSub: strings.Contains(display.AudioLabel, "Sub")}
	current.HasDub = current.HasDub || episode.HasDub
	current.HasSub = current.HasSub || episode.HasSub || episode.SubOnly
	display.AudioLabel = animeEpisodeAudioLabel(current)
}

func episodeOrderLabel(order int) string {
	if order%10 == 0 {
		return strconv.Itoa(order / 10)
	}
	return fmt.Sprintf("%d.%d", order/10, order%10)
}

func matchingTMDBEpisode(episodes map[int]tmdb.Episode, title string) tmdb.Episode {
	title = normalizedEpisodeTitle(title)
	if title == "" {
		return tmdb.Episode{}
	}
	for _, episode := range episodes {
		candidate := normalizedEpisodeTitle(episode.Name)
		if candidate == title || candidate != "" && (strings.Contains(candidate, title) || strings.Contains(title, candidate)) {
			return episode
		}
	}
	return tmdb.Episode{}
}

func matchingTMDBEpisodeForSource(episodes map[int]tmdb.Episode, mediaOffset int, episode domain.CanonicalEpisode) tmdb.Episode {
	if !episode.Special {
		return matchingTMDBEpisode(episodes, episode.Title)
	}
	previousDate, nextDate := regularEpisodeDateBounds(episodes, mediaOffset*10+episode.SortOrder())
	titleMatches := matchingSeasonZeroEpisodes(episodes, episode.Title)
	if len(titleMatches) == 1 {
		return titleMatches[0]
	}
	if match := specialEpisodeCandidatesWithinBounds(titleMatches, previousDate, nextDate); match.ID > 0 {
		return match
	}
	return specialEpisodeWithinBounds(episodes, previousDate, nextDate)
}

func regularEpisodeDateBounds(episodes map[int]tmdb.Episode, position int) (time.Time, time.Time) {
	var previousDate, nextDate time.Time
	for _, media := range episodes {
		if media.SeasonNumber <= 0 {
			continue
		}
		date, err := time.Parse("2006-01-02", media.AirDate)
		if err != nil {
			continue
		}
		order := media.EpisodeNumber * 10
		if order <= position && (previousDate.IsZero() || date.After(previousDate)) {
			previousDate = date
		}
		if order > position && (nextDate.IsZero() || date.Before(nextDate)) {
			nextDate = date
		}
	}
	return previousDate, nextDate
}

func specialEpisodeWithinBounds(episodes map[int]tmdb.Episode, previousDate time.Time, nextDate time.Time) tmdb.Episode {
	candidates := make([]tmdb.Episode, 0, len(episodes))
	for _, media := range episodes {
		candidates = append(candidates, media)
	}
	return specialEpisodeCandidatesWithinBounds(candidates, previousDate, nextDate)
}

func specialEpisodeCandidatesWithinBounds(candidates []tmdb.Episode, previousDate time.Time, nextDate time.Time) tmdb.Episode {
	var best tmdb.Episode
	var bestDate time.Time
	for _, media := range candidates {
		date, ok := boundedSpecialDate(media, previousDate, nextDate)
		if !ok {
			continue
		}
		if betterBoundedSpecialDate(date, bestDate, previousDate) {
			best = media
			bestDate = date
		}
	}
	return best
}

func boundedSpecialDate(media tmdb.Episode, previousDate time.Time, nextDate time.Time) (time.Time, bool) {
	if media.SeasonNumber != 0 {
		return time.Time{}, false
	}
	date, err := time.Parse("2006-01-02", media.AirDate)
	if err != nil || !previousDate.IsZero() && date.Before(previousDate) || !nextDate.IsZero() && date.After(nextDate) {
		return time.Time{}, false
	}
	return date, true
}

func betterBoundedSpecialDate(candidate time.Time, current time.Time, previousDate time.Time) bool {
	if current.IsZero() {
		return true
	}
	if previousDate.IsZero() {
		return candidate.After(current)
	}
	return candidate.Before(current)
}

func normalizedEpisodeTitle(title string) string {
	var out strings.Builder
	for _, r := range strings.ToLower(title) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			out.WriteRune(r)
		}
	}
	return strings.ReplaceAll(out.String(), "part", "")
}

func (h *AnimeHandler) expandEpisodeMappingSegments(ctx context.Context, group mappingGroup, mappings []animeMapping) []animeMapping {
	ids := make([]int, 0, len(mappings))
	for _, mapping := range mappings {
		if mapping.AniListID > 0 {
			ids = append(ids, mapping.AniListID)
		}
	}
	segments, err := h.mappings.MappingSegments(ctx, group, ids)
	if err != nil {
		slog.Warn("anime_episode_list_mapping_segments_failed", "component", "anime", "fields", map[string]any{
			"tmdb_media_type": group.MediaType,
			"tmdb_id":         group.TMDBID,
		}, "error", err)
		return mappings
	}
	expanded := make([]animeMapping, 0, len(mappings))
	for _, mapping := range mappings {
		mappedSegments := deduplicateAnimeMappingSegments(segments[mapping.AniListID])
		if len(mappedSegments) == 0 {
			expanded = append(expanded, mapping)
			continue
		}
		for _, segment := range mappedSegments {
			part := mapping
			part.Season = segment.Season
			part.EpisodeMin = segment.SourceEpisodeMin
			part.EpisodeMax = segment.SourceEpisodeMax
			part.TMDBEpisodeMin = segment.TMDBEpisodeMin
			part.TMDBEpisodeMax = segment.TMDBEpisodeMax
			expanded = append(expanded, part)
		}
	}
	return expanded
}

func deduplicateAnimeMappingSegments(segments []animeMappingSegment) []animeMappingSegment {
	if len(segments) < 2 {
		return segments
	}
	selected := make(map[animeSegmentSourceKey]animeMappingSegment, len(segments))
	for _, segment := range segments {
		key := animeSegmentSourceKey{
			SourceEpisodeMin: segment.SourceEpisodeMin,
			SourceEpisodeMax: segment.SourceEpisodeMax,
		}
		current, ok := selected[key]
		if !ok || betterAnimeMappingSegment(segment, current) {
			selected[key] = segment
		}
	}
	out := make([]animeMappingSegment, 0, len(selected))
	for _, segment := range selected {
		out = append(out, segment)
	}
	out = pruneContainedAnimeMappingSegments(out)
	sort.Slice(out, func(i, j int) bool {
		if out[i].Season != out[j].Season {
			return out[i].Season < out[j].Season
		}
		return out[i].SourceEpisodeMin < out[j].SourceEpisodeMin
	})
	return out
}

func pruneContainedAnimeMappingSegments(segments []animeMappingSegment) []animeMappingSegment {
	if len(segments) < 2 {
		return segments
	}
	out := make([]animeMappingSegment, 0, len(segments))
	for index, segment := range segments {
		contained := false
		for otherIndex, other := range segments {
			if index != otherIndex && animeSegmentSourceContains(other, segment) {
				contained = true
				break
			}
		}
		if !contained {
			out = append(out, segment)
		}
	}
	return out
}

func animeSegmentSourceContains(container animeMappingSegment, segment animeMappingSegment) bool {
	if container.SourceEpisodeMin <= 0 || container.SourceEpisodeMax <= 0 || segment.SourceEpisodeMin <= 0 || segment.SourceEpisodeMax <= 0 {
		return false
	}
	if container.SourceEpisodeMin > segment.SourceEpisodeMin || container.SourceEpisodeMax < segment.SourceEpisodeMax {
		return false
	}
	return container.SourceEpisodeMin < segment.SourceEpisodeMin || container.SourceEpisodeMax > segment.SourceEpisodeMax
}

type animeSegmentSourceKey struct {
	SourceEpisodeMin int
	SourceEpisodeMax int
}

func betterAnimeMappingSegment(candidate animeMappingSegment, current animeMappingSegment) bool {
	candidateAligned := alignedAnimeMappingSegment(candidate)
	currentAligned := alignedAnimeMappingSegment(current)
	if candidateAligned != currentAligned {
		return candidateAligned
	}
	return candidate.Season > current.Season
}

func alignedAnimeMappingSegment(segment animeMappingSegment) bool {
	return segment.SourceEpisodeMin > 0 &&
		segment.SourceEpisodeMax > 0 &&
		segment.SourceEpisodeMin == segment.TMDBEpisodeMin &&
		segment.SourceEpisodeMax == segment.TMDBEpisodeMax
}

func (h *AnimeHandler) tmdbReleaseEpisodes(ctx context.Context, anime domain.Anime, mappings []animeMapping, sources []animeEpisodeSource) map[int]tmdb.Episode {
	if h.tmdbClient == nil || len(mappings) == 0 {
		return nil
	}
	type seasonResult struct {
		episodes []tmdb.Episode
		ok       bool
	}
	results := make([]seasonResult, len(mappings))
	var group errgroup.Group
	group.SetLimit(tmdbMetadataWorkers)
	for index, mapping := range mappings {
		group.Go(func() error {
			match := tmdbReleaseMetadataMatch(anime, mapping, sources)
			results[index].episodes, results[index].ok = h.tmdbReleaseSeason(ctx, anime.MalID, mapping, match)
			return nil
		})
	}
	_ = group.Wait()

	episodes := map[int]tmdb.Episode{}
	seenSpecials := map[int64]bool{}
	for index, mapping := range mappings {
		if !results[index].ok {
			continue
		}
		appendTMDBReleaseSeason(episodes, mapping, results[index].episodes)
		if mapping.Season > 0 && !seenSpecials[mapping.Group.TMDBID] {
			specialCtx, specialCancel := context.WithTimeout(ctx, tmdbMetadataTimeout)
			h.appendTMDBSpecialEpisodes(specialCtx, mapping.Group.TMDBID, episodes)
			specialCancel()
			seenSpecials[mapping.Group.TMDBID] = true
		}
	}
	return episodes
}

func (h *AnimeHandler) tmdbContinuationMappings(ctx context.Context, mappings []animeMapping, maxAvailableEpisode int) []animeMapping {
	latest, ok := h.latestContinuationMapping(mappings, maxAvailableEpisode)
	if !ok {
		return nil
	}

	var extensions []animeMapping
	previous := latest
	if previous.EpisodeMax <= 0 || previous.TMDBEpisodeMin <= 0 || previous.TMDBEpisodeMax <= 0 {
		seasonCtx, cancel := context.WithTimeout(ctx, tmdbMetadataTimeout)
		season, err := h.tmdbClient.GetSeasonMetadata(seasonCtx, previous.Group.TMDBID, previous.Season, "en-US")
		cancel()
		if err != nil {
			return nil
		}
		previous, ok = tmdbContinuationSeedMapping(previous, season)
		if !ok {
			return nil
		}
	}
	for previous.EpisodeMax < maxAvailableEpisode {
		next, ok := h.nextTMDBContinuationMapping(ctx, previous)
		if !ok {
			break
		}
		extensions = append(extensions, next)
		previous = next
	}
	return extensions
}

func (h *AnimeHandler) latestContinuationMapping(mappings []animeMapping, maxAvailableEpisode int) (animeMapping, bool) {
	if h.tmdbClient == nil || maxAvailableEpisode <= 0 {
		return animeMapping{}, false
	}
	latest, ok := latestTVReleaseMapping(mappings)
	if !ok || latest.EpisodeMax > 0 && latest.EpisodeMax >= maxAvailableEpisode {
		return animeMapping{}, false
	}
	return latest, true
}

func (h *AnimeHandler) nextTMDBContinuationMapping(ctx context.Context, previous animeMapping) (animeMapping, bool) {
	seasonNumber := previous.Season + 1
	seasonCtx, cancel := context.WithTimeout(ctx, tmdbMetadataTimeout)
	season, err := h.tmdbClient.GetSeasonMetadata(seasonCtx, previous.Group.TMDBID, seasonNumber, "en-US")
	cancel()
	if err != nil || len(season.Episodes) == 0 {
		return animeMapping{}, false
	}
	next, ok := tmdbContinuationMapping(previous, season)
	return next, ok && next.EpisodeMax > previous.EpisodeMax
}

func latestTVReleaseMapping(mappings []animeMapping) (animeMapping, bool) {
	var latest animeMapping
	found := false
	for _, mapping := range mappings {
		if mapping.Group.MediaType != string(tmdb.MediaTypeTV) || mapping.Group.TMDBID <= 0 || mapping.Season <= 0 || mapping.Kind != episodeKindRegular {
			continue
		}
		if !found || mapping.EpisodeMax > latest.EpisodeMax || mapping.EpisodeMax == latest.EpisodeMax && mapping.Season > latest.Season {
			latest = mapping
			found = true
		}
	}
	return latest, found
}

func tmdbContinuationSeedMapping(mapping animeMapping, season tmdb.Season) (animeMapping, bool) {
	tmdbMin, tmdbMax, ok := tmdbSeasonEpisodeRange(season.Episodes)
	if !ok {
		return animeMapping{}, false
	}
	if mapping.EpisodeMin <= 0 {
		mapping.EpisodeMin = 1
	}
	if mapping.EpisodeMax <= 0 {
		mapping.EpisodeMax = mapping.EpisodeMin + tmdbMax - tmdbMin
	}
	mapping.TMDBEpisodeMin = tmdbMin
	mapping.TMDBEpisodeMax = tmdbMax
	return mapping, true
}

func tmdbContinuationMapping(previous animeMapping, season tmdb.Season) (animeMapping, bool) {
	tmdbMin, tmdbMax, ok := tmdbSeasonEpisodeRange(season.Episodes)
	if !ok {
		return animeMapping{}, false
	}
	sourceMin := tmdbMin
	if previous.EpisodeMax > 0 && tmdbMin <= previous.EpisodeMax {
		sourceMin = previous.EpisodeMax + 1
	}
	seasonNumber := season.SeasonNumber
	if seasonNumber <= 0 {
		seasonNumber = previous.Season + 1
	}
	next := previous
	next.Season = seasonNumber
	next.EpisodeMin = sourceMin
	next.EpisodeMax = sourceMin + tmdbMax - tmdbMin
	next.TMDBEpisodeMin = tmdbMin
	next.TMDBEpisodeMax = tmdbMax
	return next, next.EpisodeMin > 0 && next.EpisodeMax >= next.EpisodeMin
}

func tmdbSeasonEpisodeRange(episodes []tmdb.Episode) (int, int, bool) {
	minEpisode := 0
	maxEpisode := 0
	for _, episode := range episodes {
		if episode.EpisodeNumber <= 0 {
			continue
		}
		if minEpisode == 0 || episode.EpisodeNumber < minEpisode {
			minEpisode = episode.EpisodeNumber
		}
		if episode.EpisodeNumber > maxEpisode {
			maxEpisode = episode.EpisodeNumber
		}
	}
	return minEpisode, maxEpisode, minEpisode > 0 && maxEpisode >= minEpisode
}

func (h *AnimeHandler) tmdbReleaseSeason(ctx context.Context, animeID int, mapping animeMapping, match tmdb.SeasonMetadataMatch) ([]tmdb.Episode, bool) {
	if mapping.Group.MediaType != string(tmdb.MediaTypeTV) || mapping.Group.TMDBID <= 0 || mapping.Season < 0 {
		return nil, false
	}
	tmdbCtx, cancel := context.WithTimeout(ctx, tmdbMetadataTimeout)
	defer cancel()
	season, err := h.tmdbClient.GetSeasonMetadataForRelease(tmdbCtx, mapping.Group.TMDBID, match, "en-US")
	if err != nil {
		slog.Warn("anime_episode_list_tmdb_season_failed", "component", "anime", "fields", map[string]any{
			"anime_id": animeID, "tmdb_id": mapping.Group.TMDBID, "tmdb_season": mapping.Season,
		}, "error", err)
		return nil, false
	}
	return season.Episodes, true
}

func tmdbReleaseMetadataMatch(anime domain.Anime, mapping animeMapping, sources []animeEpisodeSource) tmdb.SeasonMetadataMatch {
	match := tmdb.SeasonMetadataMatch{
		SeasonNumber: mapping.Season,
		EpisodeMin:   mapping.TMDBEpisodeMin,
		EpisodeMax:   mapping.TMDBEpisodeMax,
	}
	if mapping.EpisodeMin > 0 && mapping.EpisodeMax >= mapping.EpisodeMin {
		match.EpisodeCount = mapping.EpisodeMax - mapping.EpisodeMin + 1
	}
	if source, ok := tmdbReleaseSource(mapping, sources); ok {
		match.EpisodeTitles = canonicalReleaseTitles(source.Episodes, mapping.EpisodeMin, mapping.EpisodeMax)
		if match.EpisodeCount == 0 {
			match.EpisodeCount = len(match.EpisodeTitles)
		}
		if mapping.EpisodeMin <= 1 {
			match.FirstAirDate = source.Anime.Aired.From
		}
		return match
	}
	if match.EpisodeCount == 0 {
		match.EpisodeCount = anime.Episodes
	}
	if mapping.EpisodeMin <= 1 {
		match.FirstAirDate = anime.Aired.From
	}
	return match
}

func tmdbReleaseSource(mapping animeMapping, sources []animeEpisodeSource) (animeEpisodeSource, bool) {
	for _, source := range sources {
		if mapping.MALID <= 0 || source.Anime.MalID == mapping.MALID {
			return source, true
		}
	}
	return animeEpisodeSource{}, false
}

func canonicalReleaseTitles(episodes []domain.CanonicalEpisode, episodeMin, episodeMax int) []string {
	titles := make([]string, 0, len(episodes))
	for _, episode := range episodes {
		if episode.Special || episodeMin > 0 && episode.Number < episodeMin || episodeMax > 0 && episode.Number > episodeMax {
			continue
		}
		titles = append(titles, episode.Title)
	}
	return titles
}

func appendTMDBReleaseSeason(out map[int]tmdb.Episode, mapping animeMapping, episodes []tmdb.Episode) {
	for index, episode := range episodes {
		sourceNumber, ok := sourceEpisodeNumberForTMDB(mapping, episode, index, len(episodes))
		if ok {
			out[sourceNumber] = episode
		}
	}
}

func sourceEpisodeNumberForTMDB(mapping animeMapping, episode tmdb.Episode, index int, seasonLength int) (int, bool) {
	if mapping.EpisodeMin <= 0 || mapping.TMDBEpisodeMin <= 0 {
		return index + 1, index >= 0
	}
	if episode.EpisodeNumber >= mapping.TMDBEpisodeMin &&
		(mapping.TMDBEpisodeMax <= 0 || episode.EpisodeNumber <= mapping.TMDBEpisodeMax) {
		return mapping.EpisodeMin + episode.EpisodeNumber - mapping.TMDBEpisodeMin, true
	}
	segmentLength := mapping.TMDBEpisodeMax - mapping.TMDBEpisodeMin + 1
	if segmentLength > 0 && seasonLength == segmentLength && index < segmentLength {
		return mapping.EpisodeMin + index, true
	}
	return 0, false
}

func (h *AnimeHandler) appendTMDBSpecialEpisodes(ctx context.Context, tmdbID int64, episodes map[int]tmdb.Episode) {
	specials, err := h.tmdbClient.GetSeason(ctx, tmdbID, 0, "en-US")
	if err != nil {
		return
	}
	for _, episode := range specials.Episodes {
		episodes[-episode.EpisodeNumber] = episode
	}
}

func (h *AnimeHandler) resolveAnimeTMDBMapping(ctx context.Context, anime domain.Anime) (animeMapping, bool) {
	if h.mappings != nil {
		resolved, err := h.mappings.Resolve(ctx, []mappingIdentity{{AniListID: anime.AniListID, MALID: anime.MalID}})
		if err != nil {
			slog.Warn("anime_episode_list_mapping_failed", "component", "anime", "fields", map[string]any{
				"anime_id":   anime.MalID,
				"anilist_id": anime.AniListID,
			}, "error", err)
		}
		if mapping, ok := resolved[mappingIdentity{AniListID: anime.AniListID, MALID: anime.MalID}]; ok {
			return mapping, true
		}
		if ref, ok := h.selectedAnimeTMDBMediaRef(ctx, anime.MalID); ok {
			return animeMapping{
				AniListID: anime.AniListID,
				MALID:     anime.MalID,
				Group:     mappingGroup{MediaType: string(ref.Type), TMDBID: ref.ID},
				Season:    fallbackTMDBSeason(anime),
			}, true
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

func (h *AnimeHandler) selectedAnimeTMDBMediaRef(ctx context.Context, animeID int) (tmdb.MediaRef, bool) {
	selections, err := h.mappings.MediaSelections(ctx, animeID)
	if err != nil {
		return tmdb.MediaRef{}, false
	}
	for _, kind := range []string{mediaSelectionBackdrop, mediaSelectionLogo} {
		selection, ok := selections[kind]
		if ok && validateEpisodeMetadataMediaRef(selection.MediaRef) {
			return selection.MediaRef, true
		}
	}
	return tmdb.MediaRef{}, false
}

func validateEpisodeMetadataMediaRef(ref tmdb.MediaRef) bool {
	return ref.ID > 0 && (ref.Type == tmdb.MediaTypeTV || ref.Type == tmdb.MediaTypeMovie)
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

func (h *AnimeHandler) HandleAnimeDetails(c *gin.Context) {
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

	section := c.Query("section")
	if h.handleRequestedAnimeSection(c, anime, section) {
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

func (h *AnimeHandler) handleRequestedAnimeSection(c *gin.Context, anime domain.Anime, section string) bool {
	if section == "" || c.GetHeader("HX-Request") != "true" {
		return false
	}
	h.handleAnimeDetailsSection(c, anime.MalID, section)
	return true
}

func (h *AnimeHandler) handleAnimeDetailsSection(c *gin.Context, id int, section string) {
	sectionCtx, cancel := context.WithTimeout(c.Request.Context(), animeSectionTimeout)
	defer cancel()

	data, tplName, err := h.loadAnimeDetailsSection(sectionCtx, id, section)
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

func (h *AnimeHandler) HandleAnimeEpisodeList(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, "invalid anime id")
		return
	}
	h.handleAnimeDetailsSection(c, id, "episode-list")
}

func (h *AnimeHandler) loadAnimeDetailsSection(ctx context.Context, id int, section string) (any, string, error) {
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
		return h.animeEpisodeList(ctx, anime), "anime_episode_list", nil
	default:
		return nil, "", nil
	}
}
