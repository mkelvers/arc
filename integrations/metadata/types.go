// Package metadata contains the provider-neutral metadata shapes used by the
// application. The shapes intentionally use MAL IDs because AllAnime and
// ChiaKi use them as their cross-provider key.
package metadata

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
	RankLabel    string        `json:"rank_label"`
	Popularity   int           `json:"popularity"`
	Status       string        `json:"status"`
	Airing       bool          `json:"airing"`
	Episodes     int           `json:"episodes"`
	Score        float64       `json:"score"`
	MeanScore    float64       `json:"mean_score"`
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
	Tags         []NamedEntity `json:"tags"`
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
	External []struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	} `json:"external"`
}

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

func (a Anime) ShortRating() string {
	if a.Rating == "" {
		return ""
	}
	for i, c := range a.Rating {
		if c == ' ' && i > 0 {
			return a.Rating[:i]
		}
	}
	return a.Rating
}

func (a Anime) ShortDuration() string {
	if a.Duration == "" {
		return ""
	}
	var num strings.Builder
	for _, c := range a.Duration {
		if c >= '0' && c <= '9' {
			num.WriteRune(c)
		} else if c == ' ' && num.Len() > 0 {
			break
		}
	}
	if num.Len() > 0 {
		return num.String() + "m"
	}
	return a.Duration
}

func (a Anime) DurationSeconds() float64 {
	if a.Duration == "" {
		return 0
	}
	var hours, minutes, current int
	hasValue := false
	for _, token := range strings.Fields(strings.ToLower(a.Duration)) {
		value, err := strconv.Atoi(token)
		if err == nil {
			current, hasValue = value, true
			continue
		}
		if !hasValue {
			continue
		}
		switch {
		case strings.HasPrefix(token, "h"):
			hours, hasValue = current, false
		case strings.HasPrefix(token, "m"):
			minutes, hasValue = current, false
		}
	}
	if hasValue {
		minutes = current
	}
	return float64(hours*60+minutes) * 60
}

func (a Anime) Premiered() string {
	if a.Season != "" && a.Year > 0 {
		return fmt.Sprintf("%s %d", seasonLabel(a.Season), a.Year)
	}
	return ""
}

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

type Episode struct {
	MalID   int    `json:"mal_id"`
	Title   string `json:"title"`
	Episode string `json:"episode"`
	Aired   string `json:"aired"`
	Filler  bool   `json:"filler"`
	Recap   bool   `json:"recap"`
}

type Pagination struct {
	HasNextPage bool `json:"has_next_page"`
}

type EpisodesResponse struct {
	Data       []Episode  `json:"data"`
	Pagination Pagination `json:"pagination"`
}

type RelationEntry struct {
	Anime     Anime
	Relation  string
	IsCurrent bool
	IsExtra   bool
}

type StaffEntry struct {
	Person struct {
		MalID  int    `json:"mal_id"`
		URL    string `json:"url"`
		Name   string `json:"name"`
		Images struct {
			Jpg struct {
				ImageURL string `json:"image_url"`
			} `json:"jpg"`
		} `json:"images"`
	} `json:"person"`
	Positions []string `json:"positions"`
}

type WatchOrderMode string

const (
	WatchOrderModeMain     WatchOrderMode = "main"
	WatchOrderModeComplete WatchOrderMode = "complete"
)

func NormalizeWatchOrderMode(value string) WatchOrderMode {
	if strings.EqualFold(strings.TrimSpace(value), string(WatchOrderModeComplete)) {
		return WatchOrderModeComplete
	}
	return WatchOrderModeMain
}
