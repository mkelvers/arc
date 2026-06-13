package service

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"mal/integrations/jikan"
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
	if expectedCount <= 0 {
		return true
	}
	if len(payload.Episodes) > expectedCount {
		return false
	}
	for _, episode := range payload.Episodes {
		if episode.Number <= 0 || episode.Number > expectedCount {
			return false
		}
	}
	return true
}

func mergeEpisodes(jikanEpisodes []jikan.Episode, availability domain.EpisodeAvailability, expectedCount int) []domain.CanonicalEpisode {
	byNumber := map[int]episodePartial{}

	for i, ep := range jikanEpisodes {
		if exceedsExpectedCount(i+1, expectedCount) {
			break
		}
		number, ok := jikanEpisodeNumber(ep, i)
		if !ok || exceedsExpectedCount(number, expectedCount) {
			continue
		}
		mergeEpisode(&byNumber, number, func(item *episodePartial) {
			item.title = strings.TrimSpace(ep.Title)
			item.filler = ep.Filler
			item.recap = ep.Recap
		})
	}
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

func jikanEpisodeNumber(ep jikan.Episode, index int) (int, bool) {
	number, err := strconv.Atoi(strings.TrimSpace(ep.Episode))
	if err == nil && number > 0 {
		return number, true
	}
	if index < 0 {
		return 0, false
	}
	return index + 1, true
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
