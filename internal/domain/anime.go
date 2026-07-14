// Package domain defines the core domain types and interfaces used across the application.
package domain

import (
	"context"
	"fmt"
	"hash/fnv"
	"mal/internal/database/db"
	"strconv"
	"strings"
	"sync"
)

type SearchResult struct {
	Animes      []Anime
	HasNextPage bool
}

type SearchOptions struct {
	Query     string
	AnimeType string
	Status    string
	OrderBy   string
	Sort      string
	Genres    []int
	StudioID  int
	SFW       bool
	Page      int
	Limit     int
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
	MalID          int          `json:"mal_id"`
	Title          string       `json:"title"`
	TitleEnglish   string       `json:"title_english"`
	TitleJapanese  string       `json:"title_japanese"`
	TitleSynonyms  []string     `json:"title_synonyms"`
	BannerImageURL string       `json:"banner_image_url"`
	Titles         []TitleEntry `json:"titles"`
	Images         struct {
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

	RecommendationRationale []string
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
	for token := range strings.FieldsSeq(strings.ToLower(a.Duration)) {
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

type Genre struct {
	MalID int
	Name  string
}

type CharacterPerson struct {
	MalID  int
	URL    string
	Name   string
	Images struct {
		Jpg struct {
			ImageURL string
		}
	}
}

type CharacterVoiceActor struct {
	Person   CharacterPerson
	Language string
}

type CharacterEntry struct {
	Character struct {
		MalID  int
		URL    string
		Name   string
		Images struct {
			Jpg struct {
				ImageURL string
			}
			Webp struct {
				ImageURL      string
				SmallImageURL string
			}
		}
	}
	Role        string
	VoiceActors []CharacterVoiceActor
}

type RecommendationEntry struct {
	Entry struct {
		MalID    int
		URL      string
		Title    string
		Synopsis string
		Images   struct {
			Webp struct {
				LargeImageURL string
			}
		}
	}
	URL   string
	Votes int
}

type RecommendationRefreshState string

const (
	RecommendationStateEmpty      RecommendationRefreshState = "empty"
	RecommendationStateRefreshing RecommendationRefreshState = "refreshing"
	RecommendationStateReady      RecommendationRefreshState = "ready"
	RecommendationStateStale      RecommendationRefreshState = "stale"
	RecommendationStateFailed     RecommendationRefreshState = "failed"
)

type StaffEntry struct {
	Person    CharacterPerson
	Positions []string
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

var genreRegistry = struct {
	sync.RWMutex
	byID   map[int]string
	byName map[string]int
}{
	byID:   make(map[int]string),
	byName: make(map[string]int),
}

func GenreID(name string) int {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0
	}
	normalized := strings.ToLower(name)

	genreRegistry.RLock()
	id, ok := genreRegistry.byName[normalized]
	genreRegistry.RUnlock()
	if ok {
		return id
	}

	hash := fnv.New32a()
	_, _ = hash.Write([]byte(normalized))
	id = int(hash.Sum32() & 0x7fffffff)
	if id == 0 {
		id = 1
	}

	genreRegistry.Lock()
	defer genreRegistry.Unlock()
	if existing, ok := genreRegistry.byName[normalized]; ok {
		return existing
	}
	for {
		if existing, ok := genreRegistry.byID[id]; !ok {
			genreRegistry.byID[id] = name
			genreRegistry.byName[normalized] = id
			return id
		} else if strings.EqualFold(existing, name) {
			genreRegistry.byName[normalized] = id
			return id
		}
		id++
		if id <= 0 {
			id = 1
		}
	}
}

func GenreName(id int) (string, bool) {
	genreRegistry.RLock()
	defer genreRegistry.RUnlock()
	name, ok := genreRegistry.byID[id]
	return name, ok
}

type AnimeCatalogService interface {
	GetCatalogSection(ctx context.Context, userID string, section string) (CatalogSectionData, error)
	GetTopPickForYou(ctx context.Context, userID string) (CatalogSectionData, error)
	GetTopPicksForYou(ctx context.Context, userID string) (CatalogSectionData, error)
}

type RecommendationInvalidator interface {
	InvalidateTopPicksForUser(userID string)
}

type AnimeSearchService interface {
	SearchAdvanced(ctx context.Context, opts SearchOptions) (SearchResult, error)
	GetGenres(ctx context.Context) ([]Genre, error)
}

type AnimeDetailsService interface {
	GetAnimeByID(ctx context.Context, id int) (Anime, error)
	GetCharacters(ctx context.Context, id int) ([]CharacterEntry, error)
	GetRecommendations(ctx context.Context, id int) ([]RecommendationEntry, error)
	GetEpisodes(ctx context.Context, id int, page int) (EpisodesResponse, error)
	GetAllEpisodes(ctx context.Context, id int) ([]EpisodeData, error)
	GetRandomAnime(ctx context.Context) (Anime, error)
	GetStaff(ctx context.Context, id int) ([]StaffEntry, error)
}

type AnimePlaybackService interface {
	GetAnimeByID(ctx context.Context, id int) (Anime, error)
	GetAllEpisodes(ctx context.Context, id int) ([]EpisodeData, error)
}

type CatalogSectionData struct {
	Animes              []Anime
	ContinueWatching    []db.GetContinueWatchingEntriesRow
	RecommendationState RecommendationRefreshState
	RetryAfterSeconds   int
	Section             string
	WatchlistMap        map[int64]bool
	Fragment            string
}

func (d CatalogSectionData) TemplateFragment() string {
	return d.Fragment
}

type AnimeRepository interface {
	GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error)
	GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error)
	GetContinueWatchingEntries(ctx context.Context, userID string) ([]db.GetContinueWatchingEntriesRow, error)
	GetContinueWatchingCarouselEntries(ctx context.Context, userID string, limit int64) ([]db.GetContinueWatchingEntriesRow, error)
}
