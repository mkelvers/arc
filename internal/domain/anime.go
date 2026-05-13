package domain

import (
	"context"
	"mal/integrations/jikan"
	"mal/internal/db"
)

type Anime = jikan.Anime
type TopAnimeResult = jikan.TopAnimeResult
type Genre = jikan.Genre
type Character = jikan.Character
type Recommendation = jikan.Recommendation

type AnimeService interface {
	GetCatalogSection(ctx context.Context, userID string, section string) (map[string]any, error)
	GetDiscoverSection(ctx context.Context, userID string, section string) (map[string]any, error)
	GetAnimeByID(ctx context.Context, id int) (Anime, error)
	SearchAdvanced(ctx context.Context, q, animeType, status, orderBy, sort string, genres []int, sfw bool, page, limit int) (jikan.SearchResponse, error)
	GetGenres(ctx context.Context) ([]Genre, error)
	GetCharacters(ctx context.Context, id int) ([]Character, error)
	GetRecommendations(ctx context.Context, id int) ([]Recommendation, error)
	GetRelations(ctx context.Context, id int) ([]jikan.Relation, error)
	GetEpisodes(ctx context.Context, id int, page int) (jikan.EpisodesResponse, error)
	GetRandomAnime(ctx context.Context) (Anime, error)
}

type AnimeRepository interface {
	GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error)
	GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error)
	GetContinueWatchingEntries(ctx context.Context, userID string) ([]db.GetContinueWatchingEntriesRow, error)
}
