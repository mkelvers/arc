package recommendations

import "mal/integrations/jikan"

type recommendationSeed struct {
	animeID int
	weight  float64
}

type weightedEntity struct {
	id     int
	weight float64
}

type profileSearchQuery struct {
	genreIDs []int
	studioID int
	weight   float64
}

type recommendationCandidate struct {
	anime              jikan.Anime
	score              float64
	genreMatches       int
	themeMatches       int
	studioMatches      int
	demographicMatches int
	rationale          []string
}

type userTasteProfile struct {
	genres        map[int]float64
	themes        map[int]float64
	studios       map[int]float64
	demographics  map[int]float64
	prefersAiring bool
	prefersRecent bool
}

type rankedCandidate struct {
	id                 int
	collaborativeScore float64
	profileSearchScore float64
	anime              jikan.Anime
	hasAnime           bool
}
