package recommendations

import "time"

const (
	maxSeeds               = 8
	maxRecommendations     = 10
	candidateFetchLimit    = 60
	candidateFetchBuffer   = 6
	TopPickLimit           = 18
	TopPicksLimit          = 60
	profileSearchLimit     = 8
	profileGenreSearches   = 2
	profileThemeSearches   = 2
	collaborativeWeight    = 1.4
	profileSearchWeight    = 0.8
	seedRecencyWindow      = 180 * 24 * time.Hour
	freshReleaseWindow     = 540 * 24 * time.Hour
	genreMatchWeight       = 1.8
	themeMatchWeight       = 1.0
	studioMatchWeight      = 0.7
	demographicMatchWeight = 0.9
	recentDiversityWindow  = 3
	genreDiversityPenalty  = 1.7
	themeDiversityPenalty  = 1.2
	demoDiversityPenalty   = 1.0
	studioDiversityPenalty = 0.7
)
