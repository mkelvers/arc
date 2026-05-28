package domain

import (
	"context"
	"mal/integrations/jikan"
	"mal/internal/db"
)

type Anime struct {
	jikan.Anime
}
type TopAnimeResult = jikan.TopAnimeResult
type Genre = jikan.Genre
type Character = jikan.CharacterEntry
type Recommendation = jikan.RecommendationEntry
type StaffEntry = jikan.StaffEntry
type Statistics = jikan.Statistics
type ThemesData = jikan.ThemesData
type ReviewEntry = jikan.ReviewEntry

type AnimeCatalogService interface {
	GetCatalogSection(ctx context.Context, userID string, section string) (CatalogSectionData, error)
}

type AnimeDiscoverService interface {
	GetDiscoverSection(ctx context.Context, userID string, section string) (DiscoverSectionData, error)
	GetDiscoverForYou(ctx context.Context, userID string) (DiscoverSectionData, error)
	GetAiringSchedule(ctx context.Context, userID string) ([]Anime, error)
}

type AnimeSearchService interface {
	SearchAdvanced(ctx context.Context, q, animeType, status, orderBy, sort string, genres []int, studioID int, sfw bool, page, limit int) (jikan.SearchResult, error)
	GetProducerNameByID(ctx context.Context, id int) (string, error)
	GetProducers(ctx context.Context, query string, page int, limit int) (jikan.ProducerListResult, error)
	GetGenres(ctx context.Context) ([]Genre, error)
}

type AnimeDetailsService interface {
	GetAnimeByID(ctx context.Context, id int) (Anime, error)
	GetCharacters(ctx context.Context, id int) ([]Character, error)
	GetRecommendations(ctx context.Context, id int) ([]Recommendation, error)
	GetRelations(ctx context.Context, id int) ([]jikan.RelationEntry, error)
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

type DiscoverSectionData struct {
	Animes       []Anime
	Section      string
	WatchlistMap map[int64]bool
	Fragment     string
}

func (d DiscoverSectionData) TemplateFragment() string {
	return d.Fragment
}

type AnimeRepository interface {
	GetUserWatchList(ctx context.Context, userID string) ([]db.GetUserWatchListRow, error)
	GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error)
	GetContinueWatchingEntries(ctx context.Context, userID string) ([]db.GetContinueWatchingEntriesRow, error)
}
