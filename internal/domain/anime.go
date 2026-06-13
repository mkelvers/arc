// Package domain defines the core domain types and interfaces used across the application.
package domain

import (
	"context"
	"mal/integrations/jikan"
	"mal/internal/db"
)

type Anime struct {
	jikan.Anime
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
		MalID  int
		URL    string
		Title  string
		Images struct {
			Webp struct {
				LargeImageURL string
			}
		}
	}
	URL   string
	Votes int
}

type StaffEntry struct {
	Person    CharacterPerson
	Positions []string
}

type StatisticsScore struct {
	Score      int
	Votes      int
	Percentage float64
}

type Statistics struct {
	Watching    int
	Completed   int
	OnHold      int
	Dropped     int
	PlanToWatch int
	Total       int
	Scores      []StatisticsScore
}

type ThemesData struct {
	Openings []string
	Endings  []string
}

type ReviewReactions struct {
	Overall     int
	Nice        int
	LoveIt      int
	Funny       int
	Confusing   int
	Informative int
	WellWritten int
	Creative    int
}

type ReviewUser struct {
	URL      string
	Username string
	Images   struct {
		Jpg struct {
			ImageURL string
		}
		Webp struct {
			ImageURL string
		}
	}
}

type ReviewEntry struct {
	MalID         int
	URL           string
	Type          string
	Reactions     ReviewReactions
	Date          string
	Review        string
	Score         int
	Tags          []string
	IsSpoiler     bool
	IsPreliminary bool
	EpisodesSeen  int
	User          ReviewUser
}

type AnimeCatalogService interface {
	GetCatalogSection(ctx context.Context, userID string, section string) (CatalogSectionData, error)
	GetTopPickForYou(ctx context.Context, userID string) (CatalogSectionData, error)
	GetTopPicksForYou(ctx context.Context, userID string) (CatalogSectionData, error)
}

type AnimeSearchService interface {
	SearchAdvanced(ctx context.Context, q, animeType, status, orderBy, sort string, genres []int, studioID int, sfw bool, page, limit int) (jikan.SearchResult, error)
	GetProducerNameByID(ctx context.Context, id int) (string, error)
	GetProducers(ctx context.Context, query string, page int, limit int) (jikan.ProducerListResult, error)
	GetGenres(ctx context.Context) ([]Genre, error)
}

type AnimeDetailsService interface {
	GetAnimeByID(ctx context.Context, id int) (Anime, error)
	GetCharacters(ctx context.Context, id int) ([]CharacterEntry, error)
	GetRecommendations(ctx context.Context, id int) ([]RecommendationEntry, error)
	GetRelations(ctx context.Context, id int, mode jikan.WatchOrderMode) ([]jikan.RelationEntry, error)
	GetEpisodes(ctx context.Context, id int, page int) (jikan.EpisodesResponse, error)
	GetAllEpisodes(ctx context.Context, id int) ([]EpisodeData, error)
	GetRandomAnime(ctx context.Context) (Anime, error)
	GetStaff(ctx context.Context, id int) ([]StaffEntry, error)
	GetStatistics(ctx context.Context, id int) (Statistics, error)
	GetThemes(ctx context.Context, id int) (ThemesData, error)
	GetReviews(ctx context.Context, id int, page int) ([]ReviewEntry, bool, error)
}

type AnimePlaybackService interface {
	GetAnimeByID(ctx context.Context, id int) (Anime, error)
	GetAllEpisodes(ctx context.Context, id int) ([]EpisodeData, error)
}

type CatalogSectionData struct {
	Animes           []Anime
	ContinueWatching []db.GetContinueWatchingEntriesRow
	Section          string
	WatchlistMap     map[int64]bool
	Fragment         string
}

func (d CatalogSectionData) TemplateFragment() string {
	return d.Fragment
}

type AnimeRepository interface {
	GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error)
	GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error)
	GetContinueWatchingEntries(ctx context.Context, userID string) ([]db.GetContinueWatchingEntriesRow, error)
}
