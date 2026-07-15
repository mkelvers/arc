package anime

import (
	"sort"
	"strings"
	"time"

	"mal/integrations/tmdb"
	"mal/internal/domain"
)

func ovaTMDBEpisodeMatches(source animeEpisodeSource, episodes map[int]tmdb.Episode) map[string]tmdb.Episode {
	if source.Kind != episodeKindOVA && source.Kind != episodeKindShorts || len(source.Episodes) == 0 {
		return nil
	}
	providerEpisodes := append([]domain.CanonicalEpisode(nil), source.Episodes...)
	sort.SliceStable(providerEpisodes, func(i, j int) bool {
		return providerEpisodes[i].SortOrder() < providerEpisodes[j].SortOrder()
	})
	start, ok := ovaTMDBSequenceStart(providerEpisodes, episodes)
	if !ok {
		start, ok = tmdbSequenceStartByAirDates(source.Anime, episodes, len(providerEpisodes))
		if !ok {
			return nil
		}
	}
	candidates := ovaTMDBSequence(episodes, start, len(providerEpisodes))
	if len(candidates) != len(providerEpisodes) {
		return nil
	}
	return assignOVASequence(providerEpisodes, candidates)
}

func tmdbSequenceStartByAirDates(anime domain.Anime, episodes map[int]tmdb.Episode, count int) (int, bool) {
	startDate, startOK := parseEpisodeDate(anime.Aired.From)
	endDate, endOK := parseEpisodeDate(anime.Aired.To)
	if count <= 0 || !startOK && !endOK {
		return 0, false
	}
	bestStart, bestScore := 0, time.Duration(1<<63-1)
	for start := 1; ; start++ {
		sequence := ovaTMDBSequence(episodes, start, count)
		if len(sequence) == 0 {
			if start > highestSeasonZeroEpisode(episodes) {
				break
			}
			continue
		}
		score, ok := sequenceDateScore(sequence, startDate, startOK, endDate, endOK)
		if ok && score < bestScore {
			bestStart, bestScore = start, score
		}
	}
	return bestStart, bestStart > 0 && bestScore <= 62*24*time.Hour
}

func highestSeasonZeroEpisode(episodes map[int]tmdb.Episode) int {
	highest := 0
	for _, episode := range episodes {
		if episode.SeasonNumber == 0 && episode.EpisodeNumber > highest {
			highest = episode.EpisodeNumber
		}
	}
	return highest
}

func sequenceDateScore(sequence []tmdb.Episode, startDate time.Time, startOK bool, endDate time.Time, endOK bool) (time.Duration, bool) {
	firstDate, firstOK := parseEpisodeDate(sequence[0].AirDate)
	lastDate, lastOK := parseEpisodeDate(sequence[len(sequence)-1].AirDate)
	if startOK && !firstOK || endOK && !lastOK {
		return 0, false
	}
	var score time.Duration
	if startOK {
		score += absoluteDuration(firstDate.Sub(startDate))
	}
	if endOK {
		score += absoluteDuration(lastDate.Sub(endDate))
	}
	return score, true
}

func parseEpisodeDate(value string) (time.Time, bool) {
	if len(value) < len("2006-01-02") {
		return time.Time{}, false
	}
	date, err := time.Parse("2006-01-02", value[:len("2006-01-02")])
	return date, err == nil
}

func absoluteDuration(value time.Duration) time.Duration {
	if value < 0 {
		return -value
	}
	return value
}

func ovaTMDBSequenceStart(providerEpisodes []domain.CanonicalEpisode, episodes map[int]tmdb.Episode) (int, bool) {
	votes := map[int]int{}
	for index, provider := range providerEpisodes {
		matches := matchingSeasonZeroEpisodes(episodes, provider.Title)
		if len(matches) == 1 {
			votes[matches[0].EpisodeNumber-index]++
		}
	}
	start, votesForStart := 0, 0
	for candidate, count := range votes {
		if candidate > 0 && count > votesForStart {
			start = candidate
			votesForStart = count
		}
	}
	return start, votesForStart > 0
}

func matchingSeasonZeroEpisodes(episodes map[int]tmdb.Episode, title string) []tmdb.Episode {
	title = normalizedEpisodeTitle(title)
	if title == "" || strings.HasPrefix(title, "episode") {
		return nil
	}
	var matches []tmdb.Episode
	for _, episode := range episodes {
		if episode.SeasonNumber == 0 && episodeTitlesMatch(title, normalizedEpisodeTitle(episode.Name)) {
			matches = append(matches, episode)
		}
	}
	return matches
}

func episodeTitlesMatch(left string, right string) bool {
	return left != "" && right != "" && (left == right || strings.Contains(left, right) || strings.Contains(right, left))
}

func ovaTMDBSequence(episodes map[int]tmdb.Episode, start int, count int) []tmdb.Episode {
	sequence := make([]tmdb.Episode, 0, count)
	for number := start; number < start+count; number++ {
		episode, ok := seasonZeroEpisodeByNumber(episodes, number)
		if !ok {
			return nil
		}
		sequence = append(sequence, episode)
	}
	return sequence
}

func seasonZeroEpisodeByNumber(episodes map[int]tmdb.Episode, number int) (tmdb.Episode, bool) {
	for _, episode := range episodes {
		if episode.SeasonNumber == 0 && episode.EpisodeNumber == number {
			return episode, true
		}
	}
	return tmdb.Episode{}, false
}

func assignOVASequence(providerEpisodes []domain.CanonicalEpisode, candidates []tmdb.Episode) map[string]tmdb.Episode {
	assigned := map[string]tmdb.Episode{}
	used := map[int64]bool{}
	for index := len(providerEpisodes) - 1; index >= 0; index-- {
		matches := matchingCandidates(candidates, providerEpisodes[index].Title, used)
		if len(matches) == 1 {
			assigned[providerEpisodes[index].PlaybackID()] = matches[0]
			used[matches[0].ID] = true
		}
	}
	remaining := unusedCandidates(candidates, used)
	for _, provider := range providerEpisodes {
		if _, ok := assigned[provider.PlaybackID()]; ok || len(remaining) == 0 {
			continue
		}
		assigned[provider.PlaybackID()] = remaining[0]
		remaining = remaining[1:]
	}
	return assigned
}

func matchingCandidates(candidates []tmdb.Episode, title string, used map[int64]bool) []tmdb.Episode {
	title = normalizedEpisodeTitle(title)
	if title == "" || strings.HasPrefix(title, "episode") {
		return nil
	}
	var matches []tmdb.Episode
	for _, candidate := range candidates {
		if !used[candidate.ID] && episodeTitlesMatch(title, normalizedEpisodeTitle(candidate.Name)) {
			matches = append(matches, candidate)
		}
	}
	return matches
}

func unusedCandidates(candidates []tmdb.Episode, used map[int64]bool) []tmdb.Episode {
	remaining := make([]tmdb.Episode, 0, len(candidates))
	for _, candidate := range candidates {
		if !used[candidate.ID] {
			remaining = append(remaining, candidate)
		}
	}
	return remaining
}
