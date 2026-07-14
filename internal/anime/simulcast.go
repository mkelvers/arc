package anime

import (
	"context"
	"mal/internal/domain"
	"slices"
	"strconv"
	"strings"
)

type animeSeason struct {
	Season string
	Year   int
}

type seasonOption struct {
	Season string
	Year   int
	Label  string
}

var seasons = []string{"winter", "spring", "summer", "fall"}

func seasonOptions(firstYear int, latest animeSeason) []seasonOption {
	options := make([]seasonOption, 0, (latest.Year-firstYear+1)*len(seasons))
	for year := latest.Year; year >= firstYear; year-- {
		start := len(seasons) - 1
		if year == latest.Year {
			start = seasonIndex(latest.Season)
		}
		for i := start; i >= 0; i-- {
			season := seasons[i]
			options = append(options, seasonOption{
				Season: season,
				Year:   year,
				Label:  strings.ToUpper(season[:1]) + season[1:] + " " + strconv.Itoa(year),
			})
		}
	}
	return options
}

func seasonIndex(season string) int {
	for i, candidate := range seasons {
		if strings.EqualFold(candidate, season) {
			return i
		}
	}
	return 0
}

func calendarSeason(year, month int) animeSeason {
	index := (month - 1) / 3
	if index < 0 || index >= len(seasons) {
		index = 0
	}
	return animeSeason{Season: seasons[index], Year: year}
}

func adjacentSeason(season string, year, direction int) animeSeason {
	index := 0
	for i, candidate := range seasons {
		if strings.EqualFold(candidate, season) {
			index = i
			break
		}
	}
	index += direction
	if index < 0 {
		index = len(seasons) - 1
		year--
	} else if index >= len(seasons) {
		index = 0
		year++
	}
	return animeSeason{Season: seasons[index], Year: year}
}

func seasonNavigation(selected animeSeason, firstYear int, latest animeSeason) (*animeSeason, *animeSeason) {
	var previous *animeSeason
	var next *animeSeason
	if selected.Year > firstYear || selected.Season != "winter" {
		value := adjacentSeason(selected.Season, selected.Year, -1)
		previous = &value
	}
	value := adjacentSeason(selected.Season, selected.Year, 1)
	if value.Year < latest.Year || value.Year == latest.Year && seasonIndex(value.Season) <= seasonIndex(latest.Season) {
		next = &value
	}
	return previous, next
}

func seasonSelection(rawSeason, rawYear string, current, latest animeSeason) animeSeason {
	season := strings.ToLower(strings.TrimSpace(rawSeason))
	validSeason := slices.Contains(seasons, season)
	year, err := strconv.Atoi(rawYear)
	if !validSeason || err != nil || year < 2000 || year > latest.Year || year == latest.Year && seasonIndex(season) > seasonIndex(latest.Season) {
		return current
	}
	return animeSeason{Season: season, Year: year}
}

func (s *SeasonDiscoveryService) LatestAvailableSeason(ctx context.Context, current animeSeason) animeSeason {
	next := adjacentSeason(current.Season, current.Year, 1)
	shows, err := s.cachedSeasonalShows(ctx, next, seasonalFetchOptions{
		source:        "latest",
		emptyFreshTTL: seasonalCacheEmptyNextTTL,
	})
	if err == nil && len(shows) > 0 {
		return next
	}
	return current
}

type SimulcastData struct {
	Animes []domain.Anime
	Season string
	Year   int
}

func (s *SeasonDiscoveryService) GetSimulcast(ctx context.Context, selected animeSeason) (SimulcastData, error) {
	shows, err := s.cachedSeasonalShows(ctx, selected, seasonalFetchOptions{
		source:        "simulcast",
		emptyFreshTTL: seasonalCacheFreshTTL,
	})
	if err != nil {
		return SimulcastData{}, err
	}
	animes := make([]domain.Anime, 0, len(shows))
	for _, show := range shows {
		anime := domain.Anime{
			MalID:        show.MalID,
			Title:        show.Name,
			TitleEnglish: show.EnglishName,
			Synopsis:     show.Description,
			Status:       show.Status,
			Type:         show.Type,
			Year:         show.Year,
			Episodes:     show.EpisodeCount,
		}
		anime.Images.Webp.LargeImageURL = show.Thumbnail
		animes = append(animes, anime)
	}
	animes = groupCardsOrOriginal(ctx, s.grouper, animes)
	return SimulcastData{
		Animes: animes,
		Season: selected.Season,
		Year:   selected.Year,
	}, nil
}
