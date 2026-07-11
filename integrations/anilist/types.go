package anilist

import (
	"encoding/json"
	"strings"
	"time"
)

type Anime struct {
	ID              int
	MALID           int
	Title           Titles
	Description     string
	Format          string
	Status          string
	StartDate       Date
	EndDate         Date
	Season          string
	SeasonYear      int
	Episodes        int
	DurationMinutes int
	Country         string
	Source          string
	CoverImage      string
	BannerImage     string
	Genres          []string
	Tags            []Tag
	Producers       []Producer
	Synonyms        []string
	AverageScore    int
	MeanScore       int
	Popularity      int
	Favourites      int
	ScoreCount      int
	Rank            int
	RankLabel       string
	PopularityRank  int
	UpdatedAt       time.Time
	IsAdult         bool
	NextAiring      *Airing
	Studios         []Studio
	Characters      []Character
	Staff           []Staff
	Relations       []Relation
	ExternalLinks   []ExternalLink
}

type Titles struct {
	Romaji        string `json:"romaji"`
	English       string `json:"english"`
	Native        string `json:"native"`
	UserPreferred string `json:"userPreferred"`
}

type Date struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	Day   int `json:"day"`
}

type Tag struct {
	ID               int    `json:"id"`
	Name             string `json:"name"`
	Rank             int    `json:"rank"`
	IsGeneralSpoiler bool   `json:"isGeneralSpoiler"`
	IsMediaSpoiler   bool   `json:"isMediaSpoiler"`
}

type Producer struct {
	Name string
}

type Airing struct {
	At      time.Time
	Episode int
}

type Studio struct {
	ID     int
	Name   string
	IsMain bool
}

type Character struct {
	ID    int
	Name  string
	Role  string
	Image string
}

type Staff struct {
	ID       int
	Name     string
	Position string
}

type Relation struct {
	Type  string
	Anime AnimeSummary
}

type AnimeSummary struct {
	ID          int
	MALID       int
	Title       Titles
	Description string
	Type        string
	Format      string
	StartYear   int
	CoverImage  string
}

type ExternalLink struct {
	Site string
	URL  string
}

type Ranking struct {
	Rank    int    `json:"rank"`
	Type    string `json:"type"`
	Context string `json:"context"`
	Season  string `json:"season"`
	Year    int    `json:"year"`
}

type SearchResult struct {
	Items       []AnimeSummary
	HasNextPage bool
}

type CatalogResult struct {
	Items       []Anime
	HasNextPage bool
}

type Recommendation struct {
	Anime AnimeSummary
	Votes int
}

type apiResponse struct {
	Data   graphData  `json:"data"`
	Errors []apiError `json:"errors"`
}

type graphData struct {
	Media           *media
	Page            *page
	GenreCollection []string
	Batch           map[string]media
}

func (g *graphData) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	g.Batch = make(map[string]media)
	for key, raw := range fields {
		if err := g.unmarshalField(key, raw); err != nil {
			return err
		}
	}
	return nil
}

func (g *graphData) unmarshalField(key string, raw json.RawMessage) error {
	switch key {
	case "Media":
		return json.Unmarshal(raw, &g.Media)
	case "Page":
		return json.Unmarshal(raw, &g.Page)
	case "GenreCollection":
		return json.Unmarshal(raw, &g.GenreCollection)
	}
	if !strings.HasPrefix(key, "m") {
		return nil
	}
	var item media
	if err := json.Unmarshal(raw, &item); err != nil {
		return err
	}
	g.Batch[key] = item
	return nil
}

type page struct {
	PageInfo pageInfo `json:"pageInfo"`
	Media    []media  `json:"media"`
}

type pageInfo struct {
	HasNextPage bool `json:"hasNextPage"`
}

type media struct {
	ID           int        `json:"id"`
	IDMal        int        `json:"idMal"`
	Title        Titles     `json:"title"`
	Description  string     `json:"description"`
	Format       string     `json:"format"`
	Type         string     `json:"type"`
	Status       string     `json:"status"`
	StartDate    Date       `json:"startDate"`
	EndDate      Date       `json:"endDate"`
	Season       string     `json:"season"`
	SeasonYear   int        `json:"seasonYear"`
	Episodes     int        `json:"episodes"`
	Duration     int        `json:"duration"`
	Country      string     `json:"countryOfOrigin"`
	Source       string     `json:"source"`
	CoverImage   coverImage `json:"coverImage"`
	BannerImage  string     `json:"bannerImage"`
	Genres       []string   `json:"genres"`
	Tags         []Tag      `json:"tags"`
	Synonyms     []string   `json:"synonyms"`
	AverageScore int        `json:"averageScore"`
	MeanScore    int        `json:"meanScore"`
	Popularity   int        `json:"popularity"`
	Favourites   int        `json:"favourites"`
	Stats        struct {
		ScoreDistribution []struct {
			Amount int `json:"amount"`
		} `json:"scoreDistribution"`
	} `json:"stats"`
	Rankings        []Ranking                 `json:"rankings"`
	UpdatedAt       int64                     `json:"updatedAt"`
	IsAdult         bool                      `json:"isAdult"`
	NextAiring      *airing                   `json:"nextAiringEpisode"`
	Studios         connection[studio]        `json:"studios"`
	Characters      connection[characterEdge] `json:"characters"`
	Staff           connection[staffEdge]     `json:"staff"`
	Relations       relationConnection        `json:"relations"`
	ExternalLinks   []ExternalLink            `json:"externalLinks"`
	Recommendations struct {
		Nodes []struct {
			Rating int          `json:"rating"`
			Media  mediaSummary `json:"mediaRecommendation"`
		} `json:"nodes"`
	} `json:"recommendations"`
}

type coverImage struct {
	ExtraLarge string `json:"extraLarge"`
	Large      string `json:"large"`
}
type airing struct {
	AiringAt int64 `json:"airingAt"`
	Episode  int   `json:"episode"`
}
type studio struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	IsMain bool   `json:"isMain"`
}
type characterEdge struct {
	Role string `json:"role"`
	Node struct {
		ID   int `json:"id"`
		Name struct {
			Full string `json:"full"`
		} `json:"name"`
		Image struct {
			Large string `json:"large"`
		} `json:"image"`
	} `json:"node"`
}
type staffEdge struct {
	Role string `json:"role"`
	Node struct {
		ID   int `json:"id"`
		Name struct {
			Full string `json:"full"`
		} `json:"name"`
	} `json:"node"`
}
type relationConnection struct {
	Edges []struct {
		RelationType string       `json:"relationType"`
		Node         mediaSummary `json:"node"`
	} `json:"edges"`
}
type mediaSummary struct {
	ID          int        `json:"id"`
	IDMal       int        `json:"idMal"`
	Title       Titles     `json:"title"`
	Description string     `json:"description"`
	Type        string     `json:"type"`
	Format      string     `json:"format"`
	StartDate   Date       `json:"startDate"`
	CoverImage  coverImage `json:"coverImage"`
}
type connection[T any] struct {
	Nodes []T `json:"nodes"`
	Edges []T `json:"edges"`
}
type apiError struct {
	Message string `json:"message"`
	Status  int    `json:"status"`
}
