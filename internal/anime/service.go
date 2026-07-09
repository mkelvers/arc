// Package anime provides anime catalog, search, and details services.
package anime

import (
	"context"
	"fmt"
	"mal/integrations/anilist"
	"mal/integrations/metadata"
	"mal/integrations/watchorder"
	"mal/internal/database/db"
	"mal/internal/domain"
	"math/rand"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"
)

type animeService struct {
	metadata         *anilist.CachedClient
	watchOrder       *watchorder.CachedClient
	repo             domain.AnimeRepository
	topPicksCache    *topPicksCache
	topPicksCacheTTL time.Duration
	computeTopPicks  recommendationComputeFunc
}

const continueWatchingCarouselLimit int64 = 24

func wrapAnimes(in []metadata.Anime) []domain.Anime {
	out := make([]domain.Anime, 0, len(in))
	for _, a := range in {
		out = append(out, domain.Anime{Anime: a})
	}
	return out
}

func NewAnimeService(_ any, repo domain.AnimeRepository) *animeService {
	return newAnimeService(nil, nil, repo)
}

func NewAnimeServiceWithProviders(_ any, metadata *anilist.CachedClient, watchOrder *watchorder.CachedClient, repo domain.AnimeRepository) *animeService {
	return newAnimeService(metadata, watchOrder, repo)
}

func NewAnimeServiceWithMetadata(metadata *anilist.CachedClient, watchOrder *watchorder.CachedClient, repo domain.AnimeRepository) *animeService {
	return newAnimeService(metadata, watchOrder, repo)
}

func newAnimeService(metadata *anilist.CachedClient, watchOrder *watchorder.CachedClient, repo domain.AnimeRepository) *animeService {
	svc := &animeService{
		metadata:         metadata,
		watchOrder:       watchOrder,
		repo:             repo,
		topPicksCache:    &topPicksCache{entries: map[topPicksCacheKey]*topPicksCacheEntry{}},
		topPicksCacheTTL: 15 * time.Minute,
	}
	svc.computeTopPicks = svc.fetchTopPicksForYou
	return svc
}

//nolint:cyclop // Catalog and continue-watching data are coordinated as one request.
func (s *animeService) GetCatalogSection(ctx context.Context, userID string, section string) (domain.CatalogSectionData, error) {
	var (
		res metadata.TopAnimeResult
		cw  []db.GetContinueWatchingEntriesRow
	)

	g, gCtx := errgroup.WithContext(ctx)

	g.Go(func() error {
		var err error
		if s.metadata != nil {
			var result anilist.CatalogResult
			switch section {
			case "Airing":
				now := time.Now()
				result, err = s.metadata.GetSeason(gCtx, currentSeason(now), now.Year(), 1, 20)
			case "Popular":
				result, err = s.metadata.GetPopular(gCtx, 1, 20)
			}
			for _, item := range result.Items {
				res.Animes = append(res.Animes, anilist.ToMetadataAnime(item))
			}
			res.HasNextPage = result.HasNextPage
		} else if section != "Continue" {
			err = fmt.Errorf("metadata provider is not configured")
		}
		if err != nil {
			return fmt.Errorf("get catalog section %q: %w", section, err)
		}
		return nil
	})

	if userID != "" && section == "Continue" {
		g.Go(func() error {
			var err error
			cw, err = s.repo.GetContinueWatchingCarouselEntries(gCtx, userID, continueWatchingCarouselLimit)
			if err != nil {
				return fmt.Errorf("get continue watching entries for %q: %w", userID, err)
			}
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return domain.CatalogSectionData{}, fmt.Errorf("wait for catalog section %q: %w", section, err)
	}

	animes := wrapAnimes(res.Animes)
	if len(animes) > 6 {
		animes = animes[:6]
	}

	return domain.CatalogSectionData{
		Animes:           animes,
		ContinueWatching: cw,
	}, nil
}

func currentSeason(now time.Time) string {
	switch now.Month() {
	case time.December, time.January, time.February:
		return "WINTER"
	case time.March, time.April, time.May:
		return "SPRING"
	case time.June, time.July, time.August:
		return "SUMMER"
	default:
		return "FALL"
	}
}

func (s *animeService) GetAnimeByID(ctx context.Context, id int) (domain.Anime, error) {
	if s.metadata != nil {
		anime, err := s.metadata.GetAnimeByMALID(ctx, id)
		if err == nil {
			return domain.Anime{Anime: anilist.ToMetadataAnime(anime)}, nil
		}
		return domain.Anime{}, fmt.Errorf("get anime by id from AniList: %w", err)
	}
	return domain.Anime{}, fmt.Errorf("get anime by id: metadata provider is unavailable")
}

func (s *animeService) SearchAdvanced(ctx context.Context, q, animeType, status, orderBy, sort string, genres []int, studioID int, sfw bool, page, limit int) (metadata.SearchResult, error) {
	if s.metadata != nil {
		result, err := s.metadata.SearchAdvanced(ctx, q, animeType, status, orderBy, sort, genres, studioID, sfw, page, limit)
		if err == nil {
			animes := make([]metadata.Anime, 0, len(result.Items))
			for _, item := range result.Items {
				animes = append(animes, anilist.ToMetadataAnime(anilist.Anime{ID: item.ID, MALID: item.MALID, Title: item.Title, Format: item.Format, SeasonYear: item.StartYear, CoverImage: item.CoverImage}))
			}
			return metadata.SearchResult{Animes: animes, HasNextPage: result.HasNextPage}, nil
		}
	}
	return metadata.SearchResult{}, fmt.Errorf("search anime: metadata provider is unavailable")
}

func (s *animeService) GetGenres(ctx context.Context) ([]domain.Genre, error) {
	if s.metadata == nil {
		return nil, fmt.Errorf("get genres: metadata provider is unavailable")
	}
	names, err := s.metadata.GetGenres(ctx)
	if err != nil {
		return nil, fmt.Errorf("get genres from AniList: %w", err)
	}
	out := make([]domain.Genre, 0, len(names))
	for _, name := range names {
		if id := metadata.GenreID(name); id > 0 {
			out = append(out, domain.Genre{MalID: id, Name: name})
		}
	}
	return out, nil
}

func (s *animeService) GetCharacters(ctx context.Context, id int) ([]domain.CharacterEntry, error) {
	if s.metadata != nil {
		anime, err := s.metadata.GetAnimeByMALID(ctx, id)
		if err == nil {
			out := make([]domain.CharacterEntry, 0, len(anime.Characters))
			for _, item := range anime.Characters {
				var mapped domain.CharacterEntry
				mapped.Character.MalID = item.ID
				mapped.Character.Name = item.Name
				mapped.Character.Images.Webp.ImageURL = item.Image
				mapped.Role = item.Role
				out = append(out, mapped)
			}
			return out, nil
		}
	}
	return nil, fmt.Errorf("get characters: AniList unavailable")
}

func (s *animeService) GetRecommendations(ctx context.Context, id int) ([]domain.RecommendationEntry, error) {
	if s.metadata != nil {
		items, err := s.metadata.GetRecommendations(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("get recommendations: %w", err)
		}
		out := make([]domain.RecommendationEntry, 0, len(items))
		for _, item := range items {
			var mapped domain.RecommendationEntry
			mapped.Entry.MalID = item.Anime.MALID
			mapped.Entry.Title = anilistFirstTitle(item.Anime.Title)
			mapped.Entry.Images.Webp.LargeImageURL = item.Anime.CoverImage
			mapped.Votes = item.Votes
			out = append(out, mapped)
		}
		return out, nil
	}
	return nil, fmt.Errorf("get recommendations: AniList unavailable")
}

func (s *animeService) GetRelations(ctx context.Context, id int, mode metadata.WatchOrderMode) ([]metadata.RelationEntry, error) {
	if s.metadata != nil && s.watchOrder != nil {
		return s.getRelationsFromProviders(ctx, id, mode)
	}
	return nil, fmt.Errorf("get relations: metadata provider is unavailable")
}

func anilistFirstTitle(title anilist.Titles) string {
	for _, value := range []string{title.English, title.Romaji, title.Native, title.UserPreferred} {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

//nolint:cyclop,gocognit // This preserves ChiaKi order while enriching only missing metadata in one batch.
func (s *animeService) getRelationsFromProviders(ctx context.Context, id int, mode metadata.WatchOrderMode) ([]metadata.RelationEntry, error) {
	ordered, err := s.watchOrder.FetchByAnimeID(ctx, id)
	if err != nil {
		return nil, err
	}
	entries := ordered.WatchOrder
	if mode != metadata.WatchOrderModeComplete {
		main := make([]watchorder.WatchOrderEntry, 0, len(entries))
		for _, entry := range entries {
			switch strings.ToLower(strings.TrimSpace(entry.Type)) {
			case "tv", "movie", "ova", "ona":
				main = append(main, entry)
			}
		}
		if len(main) > 0 {
			entries = main
		}
	}

	ids := make([]int, 0, len(entries))
	for _, entry := range entries {
		ids = append(ids, entry.ID)
	}
	items, err := s.metadata.GetAnimeBatchByMALID(ctx, ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[int]metadata.Anime, len(items))
	for _, item := range items {
		byID[item.MALID] = anilist.ToMetadataAnime(item)
	}

	result := make([]metadata.RelationEntry, 0, len(entries))
	seen := make(map[int]bool, len(entries))
	for _, entry := range entries {
		if seen[entry.ID] {
			continue
		}
		seen[entry.ID] = true
		anime, ok := byID[entry.ID]
		if !ok {
			continue
		}
		result = append(result, metadata.RelationEntry{Anime: anime, Relation: entry.Type, IsCurrent: entry.ID == id, IsExtra: entry.Secondary})
	}
	return result, nil
}

func (s *animeService) WarmDetailSections(id int) {
}

func (s *animeService) GetEpisodes(ctx context.Context, id int, page int) (metadata.EpisodesResponse, error) {
	return metadata.EpisodesResponse{}, fmt.Errorf("get episodes: episode metadata is provided by AllAnime")
}

func (s *animeService) GetStaff(ctx context.Context, id int) ([]domain.StaffEntry, error) {
	if s.metadata != nil {
		anime, err := s.metadata.GetAnimeByMALID(ctx, id)
		if err == nil {
			out := make([]domain.StaffEntry, 0, len(anime.Staff))
			for _, item := range anime.Staff {
				var mapped domain.StaffEntry
				mapped.Person.MalID = item.ID
				mapped.Person.Name = item.Name
				mapped.Positions = []string{item.Position}
				out = append(out, mapped)
			}
			return out, nil
		}
	}
	return nil, fmt.Errorf("get staff: AniList unavailable")
}

func (s *animeService) GetRandomAnime(ctx context.Context) (domain.Anime, error) {
	randomCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if s.metadata != nil {
		result, err := s.metadata.GetPopular(randomCtx, 1, 50)
		if err == nil && len(result.Items) > 0 {
			r := rand.New(rand.NewSource(time.Now().UnixNano()))
			return domain.Anime{Anime: anilist.ToMetadataAnime(result.Items[r.Intn(len(result.Items))])}, nil
		}
		return domain.Anime{}, fmt.Errorf("get random anime: AniList unavailable: %w", err)
	}
	return domain.Anime{}, fmt.Errorf("get random anime: metadata provider is unavailable")
}

func (s *animeService) GetAllEpisodes(ctx context.Context, id int) ([]domain.EpisodeData, error) {
	return nil, fmt.Errorf("get all episodes: use the AllAnime episode service")
}
