package jikan

import (
	"fmt"
	"strconv"
	"strings"
)

type SearchResult struct {
	Animes      []Anime
	HasNextPage bool
}

type TopAnimeResult struct {
	Animes      []Anime
	HasNextPage bool
}

type StudioAnimeResult struct {
	Animes      []Anime
	HasNextPage bool
	StudioName  string
}

type ProducerResponse struct {
	Data struct {
		MalID  int `json:"mal_id"`
		Titles []struct {
			Type  string `json:"type"`
			Title string `json:"title"`
		} `json:"titles"`
		Images struct {
			Jpg struct {
				ImageURL string `json:"image_url"`
			} `json:"jpg"`
		} `json:"images"`
		Favorites   int    `json:"favorites"`
		Established string `json:"established"`
		About       string `json:"about"`
		Count       int    `json:"count"`
		External    []struct {
			Name string `json:"name"`
			URL  string `json:"url"`
		} `json:"external"`
	} `json:"data"`
}

type NamedEntity struct {
	MalID int    `json:"mal_id"`
	Name  string `json:"name"`
}

type Aired struct {
	From   string `json:"from"`
	To     string `json:"to"`
	String string `json:"string"`
}

type TitleEntry struct {
	Type  string `json:"type"`
	Title string `json:"title"`
}

type Anime struct {
	MalID         int          `json:"mal_id"`
	Title         string       `json:"title"`
	TitleEnglish  string       `json:"title_english"`
	TitleJapanese string       `json:"title_japanese"`
	TitleSynonyms []string     `json:"title_synonyms"`
	Titles        []TitleEntry `json:"titles"`
	Images        struct {
		Jpg struct {
			LargeImageURL string `json:"large_image_url"`
		} `json:"jpg"`
		Webp struct {
			LargeImageURL string `json:"large_image_url"`
		} `json:"webp"`
	} `json:"images"`
	Synopsis     string        `json:"synopsis"`
	Rank         int           `json:"rank"`
	Popularity   int           `json:"popularity"`
	Status       string        `json:"status"`
	Airing       bool          `json:"airing"`
	Episodes     int           `json:"episodes"`
	Score        float64       `json:"score"`
	Season       string        `json:"season"`
	Year         int           `json:"year"`
	Type         string        `json:"type"`
	Rating       string        `json:"rating"`
	Duration     string        `json:"duration"`
	ScoredBy     int           `json:"scored_by"`
	Aired        Aired         `json:"aired"`
	Genres       []NamedEntity `json:"genres"`
	Studios      []NamedEntity `json:"studios"`
	Producers    []NamedEntity `json:"producers"`
	Themes       []NamedEntity `json:"themes"`
	Source       string        `json:"source"`
	Background   string        `json:"background"`
	Favorites    int           `json:"favorites"`
	Members      int           `json:"members"`
	Demographics []NamedEntity `json:"demographics"`
	Licensors    []NamedEntity `json:"licensors"`
	Broadcast    struct {
		Day      string `json:"day"`
		Time     string `json:"time"`
		Timezone string `json:"timezone"`
		String   string `json:"string"`
	} `json:"broadcast"`
	Trailer struct {
		YoutubeID string `json:"youtube_id"`
		URL       string `json:"url"`
		EmbedURL  string `json:"embed_url"`
		Images    struct {
			ImageURL        string `json:"image_url"`
			SmallImageURL   string `json:"small_image_url"`
			MediumImageURL  string `json:"medium_image_url"`
			LargeImageURL   string `json:"large_image_url"`
			MaximumImageURL string `json:"maximum_image_url"`
		} `json:"images"`
	} `json:"trailer"`
	Streaming []struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	} `json:"streaming"`
	Relations []JikanRelationGroup `json:"relations"`
	External  []struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	} `json:"external"`
}

type CharacterVoiceActor struct {
	Person struct {
		MalID  int    `json:"mal_id"`
		URL    string `json:"url"`
		Images struct {
			Jpg struct {
				ImageURL string `json:"image_url"`
			} `json:"jpg"`
		} `json:"images"`
		Name string `json:"name"`
	} `json:"person"`
	Language string `json:"language"`
}

type CharacterEntry struct {
	Character struct {
		MalID  int    `json:"mal_id"`
		URL    string `json:"url"`
		Images struct {
			Jpg struct {
				ImageURL string `json:"image_url"`
			} `json:"jpg"`
			Webp struct {
				ImageURL      string `json:"image_url"`
				SmallImageURL string `json:"small_image_url"`
			} `json:"webp"`
		} `json:"images"`
		Name string `json:"name"`
	} `json:"character"`
	Role        string                `json:"role"`
	VoiceActors []CharacterVoiceActor `json:"voice_actors"`
}

type CharactersResponse struct {
	Data []CharacterEntry `json:"data"`
}

type RecommendationEntry struct {
	Entry struct {
		MalID  int    `json:"mal_id"`
		URL    string `json:"url"`
		Images struct {
			Webp struct {
				LargeImageURL string `json:"large_image_url"`
			} `json:"webp"`
		} `json:"images"`
		Title string `json:"title"`
	} `json:"entry"`
	URL   string `json:"url"`
	Votes int    `json:"votes"`
}

type RecommendationsResponse struct {
	Data []RecommendationEntry `json:"data"`
}

// ShortRating extracts just the rating code (e.g. "PG-13") from full rating string.
func (a Anime) ShortRating() string {
	if a.Rating == "" {
		return ""
	}
	// Rating format: "PG-13 - Teens 13 or older"
	for i, c := range a.Rating {
		if c == ' ' && i > 0 {
			return a.Rating[:i]
		}
	}
	return a.Rating
}

// ShortDuration extracts numeric duration in minutes (e.g. "23m" from "23 min per ep").
func (a Anime) ShortDuration() string {
	if a.Duration == "" {
		return ""
	}
	// Duration format: "23 min per ep" or "1 hr 30 min"
	var num strings.Builder
	for _, c := range a.Duration {
		if c >= '0' && c <= '9' {
			num.WriteString(string(c))
		} else if c == ' ' && num.String() != "" {
			break
		}
	}
	if num.String() != "" {
		return num.String() + "m"
	}
	return a.Duration
}

// DurationSeconds converts duration string to total seconds (e.g. "1 hr 30 min" -> 5400).
func (a Anime) DurationSeconds() float64 {
	if a.Duration == "" {
		return 0
	}
	var hours, minutes int
	var currentValue int
	hasValue := false

	for token := range strings.FieldsSeq(strings.ToLower(a.Duration)) {
		value, err := strconv.Atoi(token)
		if err == nil {
			currentValue = value
			hasValue = true
			continue
		}
		if !hasValue {
			continue
		}

		switch {
		case strings.HasPrefix(token, "h"):
			hours = currentValue
			hasValue = false
		case strings.HasPrefix(token, "m"):
			minutes = currentValue
			hasValue = false
		}
	}

	if hasValue {
		minutes = currentValue
	}

	return float64(hours*60+minutes) * 60
}

// Premiered returns formatted premiere string (e.g. "Winter 2020").
func (a Anime) Premiered() string {
	if a.Season != "" && a.Year > 0 {
		return fmt.Sprintf("%s %d", seasonLabel(a.Season), a.Year)
	}
	return ""
}

// seasonLabel normalizes season string to title case (fall/autumn -> Fall).
func seasonLabel(season string) string {
	switch strings.ToLower(season) {
	case "winter":
		return "Winter"
	case "spring":
		return "Spring"
	case "summer":
		return "Summer"
	case "fall", "autumn":
		return "Fall"
	default:
		if season == "" {
			return ""
		}
		return strings.ToUpper(season[:1]) + strings.ToLower(season[1:])
	}
}

type AnimeResponse struct {
	Data Anime `json:"data"`
}

type Genre struct {
	MalID int    `json:"mal_id"`
	Name  string `json:"name"`
}

type GenresResponse struct {
	Data []Genre `json:"data"`
}

type SearchResponse struct {
	Data       []Anime    `json:"data"`
	Pagination Pagination `json:"pagination"`
}

type Pagination struct {
	LastVisiblePage int  `json:"last_visible_page"`
	HasNextPage     bool `json:"has_next_page"`
}

type TopAnimeResponse struct {
	Data       []Anime    `json:"data"`
	Pagination Pagination `json:"pagination"`
}

type EpisodeImages struct {
	Jpg struct {
		ImageURL string `json:"image_url"`
	} `json:"jpg"`
}

type Episode struct {
	MalID   int            `json:"mal_id"`
	Title   string         `json:"title"`
	Episode string         `json:"episode"`
	Filler  bool           `json:"filler"`
	Recap   bool           `json:"recap"`
	Images  *EpisodeImages `json:"images,omitempty"`
}

type EpisodesResponse struct {
	Data       []Episode  `json:"data"`
	Pagination Pagination `json:"pagination"`
}

type EpisodeResponse struct {
	Data Episode `json:"data"`
}

type JikanRelationEntry struct {
	MalID int    `json:"mal_id"`
	Type  string `json:"type"`
	Name  string `json:"name"`
	URL   string `json:"url"`
}

type JikanRelationGroup struct {
	Relation string               `json:"relation"`
	Entry    []JikanRelationEntry `json:"entry"`
}

type JikanRelationsResponse struct {
	Data []JikanRelationGroup `json:"data"`
}

type RelationEntry struct {
	Anime     Anime
	Relation  string
	IsCurrent bool
	IsExtra   bool
}

// Staff types

type StaffEntry struct {
	Person struct {
		MalID  int    `json:"mal_id"`
		URL    string `json:"url"`
		Images struct {
			Jpg struct {
				ImageURL string `json:"image_url"`
			} `json:"jpg"`
		} `json:"images"`
		Name string `json:"name"`
	} `json:"person"`
	Positions []string `json:"positions"`
}

type StaffResponse struct {
	Data []StaffEntry `json:"data"`
}

type StatisticsScore struct {
	Score      int     `json:"score"`
	Votes      int     `json:"votes"`
	Percentage float64 `json:"percentage"`
}

type Statistics struct {
	Watching    int               `json:"watching"`
	Completed   int               `json:"completed"`
	OnHold      int               `json:"on_hold"`
	Dropped     int               `json:"dropped"`
	PlanToWatch int               `json:"plan_to_watch"`
	Total       int               `json:"total"`
	Scores      []StatisticsScore `json:"scores"`
}

type StatisticsResponse struct {
	Data Statistics `json:"data"`
}

type ThemesData struct {
	Openings []string `json:"openings"`
	Endings  []string `json:"endings"`
}

type ThemesResponse struct {
	Data ThemesData `json:"data"`
}

type ReviewReactions struct {
	Overall     int `json:"overall"`
	Nice        int `json:"nice"`
	LoveIt      int `json:"love_it"`
	Funny       int `json:"funny"`
	Confusing   int `json:"confusing"`
	Informative int `json:"informative"`
	WellWritten int `json:"well_written"`
	Creative    int `json:"creative"`
}

type ReviewEntry struct {
	MalID         int             `json:"mal_id"`
	URL           string          `json:"url"`
	Type          string          `json:"type"`
	Reactions     ReviewReactions `json:"reactions"`
	Date          string          `json:"date"`
	Review        string          `json:"review"`
	Score         int             `json:"score"`
	Tags          []string        `json:"tags"`
	IsSpoiler     bool            `json:"is_spoiler"`
	IsPreliminary bool            `json:"is_preliminary"`
	EpisodesSeen  int             `json:"episodes_seen"`
	User          struct {
		URL      string `json:"url"`
		Username string `json:"username"`
		Images   struct {
			Jpg struct {
				ImageURL string `json:"image_url"`
			} `json:"jpg"`
			Webp struct {
				ImageURL string `json:"image_url"`
			} `json:"webp"`
		} `json:"images"`
	} `json:"user"`
}

type ReviewsResponse struct {
	Data       []ReviewEntry `json:"data"`
	Pagination Pagination    `json:"pagination"`
}

// DisplayTitle returns English title if available, otherwise default title, titles[0], then Japanese.
func (a Anime) DisplayTitle() string {
	if a.TitleEnglish != "" {
		return a.TitleEnglish
	}
	if a.Title != "" {
		return a.Title
	}
	if len(a.Titles) > 0 && a.Titles[0].Title != "" {
		return a.Titles[0].Title
	}
	return a.TitleJapanese
}
