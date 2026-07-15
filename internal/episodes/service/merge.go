package service

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"mal/internal/domain"
)

type episodePartial struct {
	title  string
	filler bool
	recap  bool
	sub    bool
	dub    bool
}

func titleCandidates(anime domain.Anime) []string {
	out := []string{anime.Title}
	if anime.TitleEnglish != "" && anime.TitleEnglish != anime.Title {
		out = append(out, anime.TitleEnglish)
	}
	if anime.TitleJapanese != "" {
		out = append(out, anime.TitleJapanese)
	}
	for _, syn := range anime.TitleSynonyms {
		if syn != "" && syn != anime.Title && syn != anime.TitleEnglish && syn != anime.TitleJapanese {
			out = append(out, syn)
		}
	}
	return out
}

func isCanonicalEpisodePayloadValid(payload domain.CanonicalEpisodeList, expectedCount int) bool {
	if payload.Source != "" {
		return providerBackedPayloadHasAvailability(payload)
	}
	if expectedCount <= 0 {
		return providerBackedPayloadHasAvailability(payload)
	}
	if len(payload.Episodes) > expectedCount {
		return false
	}
	for _, episode := range payload.Episodes {
		if episode.Number <= 0 || episode.Number > expectedCount {
			return false
		}
	}
	return providerBackedPayloadHasAvailability(payload)
}

func providerBackedPayloadHasAvailability(payload domain.CanonicalEpisodeList) bool {
	if payload.Source == "" {
		return true
	}
	for _, episode := range payload.Episodes {
		if !episode.HasSub && !episode.HasDub {
			return false
		}
	}
	return true
}

func mergeEpisodes(availability domain.EpisodeAvailability, expectedCount int) []domain.CanonicalEpisode {
	return mergeEpisodeData(mergeEpisodeInput{availability: availability, expectedCount: expectedCount, now: time.Now()})
}

type mergeEpisodeInput struct {
	providerEpisodes          []domain.Episode
	availability              domain.EpisodeAvailability
	expectedCount             int
	now                       time.Time
	providerVerified          bool
	firstAired                string
	requireProviderAiredDates bool
}

func mergeEpisodeData(input mergeEpisodeInput) []domain.CanonicalEpisode {
	providerEpisodes, availability := input.providerEpisodes, input.availability
	expectedCount, now := input.expectedCount, input.now
	byID := map[string]episodePartial{}
	providerIDs := availableEpisodeIDs(availability, expectedCount)
	providerBacked := input.providerVerified || len(providerIDs) > 0

	for id := range providerIDs {
		mergeEpisode(&byID, id, func(item *episodePartial) {
			item.title = availability.Titles[id]
		})
	}

	mergeProviderEpisodes(providerMergeInput{byID: &byID, episodes: providerEpisodes, providerIDs: providerIDs, providerBacked: providerBacked, expectedCount: expectedCount, now: now, firstAired: input.firstAired, requireAiredDates: input.requireProviderAiredDates})
	mergeAvailability(&byID, availability.Sub, providerIDs, func(item *episodePartial) { item.sub = true })
	mergeAvailability(&byID, availability.Dub, providerIDs, func(item *episodePartial) { item.dub = true })

	identities := make([]episodeIdentity, 0, len(byID))
	for id := range byID {
		identity, ok := parseEpisodeIdentity(id, expectedCount)
		if ok {
			identities = append(identities, identity)
		}
	}
	sort.Slice(identities, func(i, j int) bool {
		if identities[i].Order != identities[j].Order {
			return identities[i].Order < identities[j].Order
		}
		return identities[i].ID < identities[j].ID
	})

	episodes := make([]domain.CanonicalEpisode, 0, len(identities))
	for _, identity := range identities {
		item := byID[identity.ID]
		title := item.title
		if title == "" {
			title = "Episode " + identity.Label
		}
		episodes = append(episodes, domain.CanonicalEpisode{
			Number:  identity.Number,
			ID:      identity.ID,
			Label:   identity.Label,
			Order:   identity.Order,
			Special: identity.Special,
			Title:   title,
			HasSub:  item.sub,
			HasDub:  item.dub,
			SubOnly: item.sub && !item.dub,
			Filler:  item.filler,
			Recap:   item.recap,
		})
	}
	return episodes
}

type providerMergeInput struct {
	byID              *map[string]episodePartial
	episodes          []domain.Episode
	providerIDs       map[string]bool
	providerBacked    bool
	expectedCount     int
	now               time.Time
	firstAired        string
	requireAiredDates bool
}

func mergeProviderEpisodes(input providerMergeInput) {
	if shouldSkipProviderMerge(input.providerBacked, input.firstAired, input.now) {
		return
	}

	for i, ep := range input.episodes {
		if exceedsExpectedCount(i+1, input.expectedCount) {
			break
		}
		number, ok := providerEpisodeNumber(ep, i)
		if !ok {
			continue
		}
		if exceedsExpectedCount(number, input.expectedCount) {
			continue
		}
		id := strconv.Itoa(number)
		if input.providerBacked && !input.providerIDs[id] {
			continue
		}
		if !input.providerBacked && !hasEpisodeAired(ep, input.now, input.requireAiredDates) {
			continue
		}
		mergeEpisode(input.byID, id, func(item *episodePartial) {
			item.title = strings.TrimSpace(ep.Title)
			item.filler = ep.Filler
			item.recap = ep.Recap
		})
	}
}

func shouldSkipProviderMerge(providerBacked bool, firstAired string, now time.Time) bool {
	return !providerBacked && !hasStartedAiring(firstAired, now)
}

func availableEpisodeIDs(availability domain.EpisodeAvailability, expectedCount int) map[string]bool {
	ids := map[string]bool{}
	for _, id := range availability.Sub {
		if _, ok := parseEpisodeIdentity(id, expectedCount); ok {
			ids[id] = true
		}
	}
	for _, id := range availability.Dub {
		if _, ok := parseEpisodeIdentity(id, expectedCount); ok {
			ids[id] = true
		}
	}
	removeEpisodeInventoryOutliers(ids)
	return ids
}

func removeEpisodeInventoryOutliers(ids map[string]bool) {
	regular := map[int]bool{}
	for id := range ids {
		identity, ok := parseEpisodeIdentity(id, 0)
		if ok && !identity.Special {
			regular[identity.Number] = true
		}
	}
	contiguous := 0
	for regular[contiguous+1] {
		contiguous++
	}
	if contiguous < 3 {
		return
	}
	for id := range ids {
		identity, ok := parseEpisodeIdentity(id, 0)
		if !ok || identity.Number > contiguous {
			delete(ids, id)
		}
	}
}

func mergeEpisode(byID *map[string]episodePartial, id string, update func(*episodePartial)) {
	item := (*byID)[id]
	update(&item)
	(*byID)[id] = item
}

func mergeAvailability(byID *map[string]episodePartial, ids []string, allowed map[string]bool, update func(*episodePartial)) {
	for _, id := range ids {
		if !allowed[id] {
			continue
		}
		mergeEpisode(byID, id, update)
	}
}

type episodeIdentity struct {
	ID      string
	Label   string
	Number  int
	Order   int
	Special bool
}

func parseEpisodeIdentity(raw string, expectedCount int) (episodeIdentity, bool) {
	id := strings.TrimSpace(raw)
	value, err := strconv.ParseFloat(id, 64)
	if err != nil || value < 0 {
		return episodeIdentity{}, false
	}
	order := int(math.Round(value * 10))
	if order == 0 {
		order = 5
	}
	special := order%10 != 0
	number := order / 10
	if !validEpisodeIdentity(number, special, expectedCount) {
		return episodeIdentity{}, false
	}
	label := episodeIdentityLabel(number, order, special)
	return episodeIdentity{ID: id, Label: label, Number: number, Order: order, Special: special}, true
}

func validEpisodeIdentity(number int, special bool, expectedCount int) bool {
	if special {
		return expectedCount <= 0 || number <= expectedCount
	}
	return number > 0 && !exceedsExpectedCount(number, expectedCount)
}

func episodeIdentityLabel(number int, order int, special bool) string {
	if special {
		return fmt.Sprintf("%d.%d", number, order%10)
	}
	return strconv.Itoa(number)
}

func providerEpisodeNumber(ep domain.Episode, index int) (int, bool) {
	number, err := strconv.Atoi(strings.TrimSpace(ep.Episode))
	if err == nil && number > 0 {
		return number, true
	}
	if index < 0 {
		return 0, false
	}
	return index + 1, true
}

func hasStartedAiring(firstAired string, now time.Time) bool {
	if strings.TrimSpace(firstAired) == "" {
		return true
	}
	startedAt, err := time.Parse(time.RFC3339, firstAired)
	if err != nil {
		return true
	}
	return !now.Before(startedAt)
}

func hasEpisodeAired(ep domain.Episode, now time.Time, requireAiredDate bool) bool {
	if strings.TrimSpace(ep.Aired) == "" {
		return !requireAiredDate
	}
	airedAt, err := time.Parse(time.RFC3339, ep.Aired)
	if err != nil {
		return !requireAiredDate
	}
	return !now.Before(airedAt)
}

func exceedsExpectedCount(number int, expectedCount int) bool {
	return expectedCount > 0 && number > expectedCount
}

func truncate(value string, maxLen int) string {
	if len(value) <= maxLen {
		return value
	}
	return value[:maxLen]
}
