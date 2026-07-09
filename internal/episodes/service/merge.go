package service

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"mal/integrations/metadata"
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

func mergeEpisodes(providerEpisodes []metadata.Episode, availability domain.EpisodeAvailability, expectedCount int) []domain.CanonicalEpisode {
	return mergeEpisodeData(providerEpisodes, availability, expectedCount, time.Now(), false, "", false)
}

func mergeEpisodesForAnime(anime domain.Anime, providerEpisodes []metadata.Episode, now time.Time, providerVerified bool) []domain.CanonicalEpisode {
	return mergeEpisodeData(providerEpisodes, domain.EpisodeAvailability{}, anime.Episodes, now, providerVerified, anime.Aired.From, anime.Airing)
}

func mergeEpisodeData(providerEpisodes []metadata.Episode, availability domain.EpisodeAvailability, expectedCount int, now time.Time, providerVerified bool, firstAired string, requireProviderAiredDates bool) []domain.CanonicalEpisode {
	byNumber := map[int]episodePartial{}
	providerNumbers := availableEpisodeNumbers(availability, expectedCount)
	providerBacked := providerVerified || len(providerNumbers) > 0

	for number := range providerNumbers {
		mergeEpisode(&byNumber, number, func(item *episodePartial) {
			item.title = availability.Titles[number]
		})
	}

	mergeProviderEpisodes(&byNumber, providerEpisodes, providerNumbers, providerBacked, expectedCount, now, firstAired, requireProviderAiredDates)
	mergeAvailability(&byNumber, availability.Sub, expectedCount, func(item *episodePartial) { item.sub = true })
	mergeAvailability(&byNumber, availability.Dub, expectedCount, func(item *episodePartial) { item.dub = true })

	numbers := make([]int, 0, len(byNumber))
	for number := range byNumber {
		numbers = append(numbers, number)
	}
	sort.Ints(numbers)

	episodes := make([]domain.CanonicalEpisode, 0, len(numbers))
	for _, number := range numbers {
		item := byNumber[number]
		title := item.title
		if title == "" {
			title = fmt.Sprintf("Episode %d", number)
		}
		episodes = append(episodes, domain.CanonicalEpisode{
			Number:  number,
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

func mergeProviderEpisodes(byNumber *map[int]episodePartial, episodes []metadata.Episode, providerNumbers map[int]bool, providerBacked bool, expectedCount int, now time.Time, firstAired string, requireAiredDates bool) {
	if shouldSkipProviderMerge(providerBacked, firstAired, now) {
		return
	}

	for i, ep := range episodes {
		if exceedsExpectedCount(i+1, expectedCount) {
			break
		}
		number, ok := providerEpisodeNumber(ep, i)
		if !ok {
			continue
		}
		if exceedsExpectedCount(number, expectedCount) {
			continue
		}
		if providerBacked && !providerNumbers[number] {
			continue
		}
		if !providerBacked && !hasEpisodeAired(ep, now, requireAiredDates) {
			continue
		}
		mergeEpisode(byNumber, number, func(item *episodePartial) {
			item.title = strings.TrimSpace(ep.Title)
			item.filler = ep.Filler
			item.recap = ep.Recap
		})
	}
}

func shouldSkipProviderMerge(providerBacked bool, firstAired string, now time.Time) bool {
	return !providerBacked && !hasStartedAiring(firstAired, now)
}

func availableEpisodeNumbers(availability domain.EpisodeAvailability, expectedCount int) map[int]bool {
	numbers := map[int]bool{}
	for _, number := range availability.Sub {
		if number > 0 && !exceedsExpectedCount(number, expectedCount) {
			numbers[number] = true
		}
	}
	for _, number := range availability.Dub {
		if number > 0 && !exceedsExpectedCount(number, expectedCount) {
			numbers[number] = true
		}
	}
	return numbers
}

func mergeEpisode(byNumber *map[int]episodePartial, number int, update func(*episodePartial)) {
	item := (*byNumber)[number]
	update(&item)
	(*byNumber)[number] = item
}

func mergeAvailability(byNumber *map[int]episodePartial, numbers []int, expectedCount int, update func(*episodePartial)) {
	for _, number := range numbers {
		if number <= 0 || exceedsExpectedCount(number, expectedCount) {
			continue
		}
		mergeEpisode(byNumber, number, update)
	}
}

func providerEpisodeNumber(ep metadata.Episode, index int) (int, bool) {
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

func hasEpisodeAired(ep metadata.Episode, now time.Time, requireAiredDate bool) bool {
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
