// Package domain defines the core domain types and interfaces used across the application.
package domain

import (
	"context"
	"mal/integrations/metadata"
	"mal/internal/database/db"
)

type Anime struct {
	metadata.Anime
	RecommendationRationale []string
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

type AnimeCatalogService interface {
	GetCatalogSection(ctx context.Context, userID string, section string) (CatalogSectionData, error)
	GetTopPickForYou(ctx context.Context, userID string) (CatalogSectionData, error)
	GetTopPicksForYou(ctx context.Context, userID string) (CatalogSectionData, error)
}

type RecommendationInvalidator interface {
	InvalidateTopPicksForUser(userID string)
}

type AnimeSearchService interface {
	SearchAdvanced(ctx context.Context, q, animeType, status, orderBy, sort string, genres []int, studioID int, sfw bool, page, limit int) (metadata.SearchResult, error)
	GetGenres(ctx context.Context) ([]Genre, error)
}

type AnimeDetailsService interface {
	GetAnimeByID(ctx context.Context, id int) (Anime, error)
	GetCharacters(ctx context.Context, id int) ([]CharacterEntry, error)
	GetRecommendations(ctx context.Context, id int) ([]RecommendationEntry, error)
	GetRelations(ctx context.Context, id int, mode metadata.WatchOrderMode) ([]metadata.RelationEntry, error)
	GetEpisodes(ctx context.Context, id int, page int) (metadata.EpisodesResponse, error)
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
