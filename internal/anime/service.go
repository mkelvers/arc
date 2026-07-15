// Package anime provides anime catalog, search, and details services.
package anime

import (
	"context"
	"fmt"
	"mal/integrations/anilist"
	"mal/internal/database/db"
	"mal/internal/domain"
	"math/rand"
	"time"

	"golang.org/x/sync/errgroup"
)

type animeService struct {
	metadata         *anilist.CachedClient
	repo             domain.AnimeRepository
	grouper          *CardGrouper
	topPicksCache    *topPicksCache
	topPicksCacheTTL time.Duration
	computeTopPicks  recommendationComputeFunc
}

const continueWatchingCarouselLimit int64 = 24

func wrapAnimes(in []domain.Anime) []domain.Anime {
	return append([]domain.Anime(nil), in...)
}

func NewAnimeServiceWithMetadata(metadata *anilist.CachedClient, repo domain.AnimeRepository, grouper *CardGrouper) *animeService {
	return newAnimeService(metadata, repo, grouper)
}

func newAnimeService(metadata *anilist.CachedClient, repo domain.AnimeRepository, grouper *CardGrouper) *animeService {
	svc := &animeService{
		metadata:         metadata,
		repo:             repo,
		grouper:          grouper,
		topPicksCache:    &topPicksCache{entries: map[topPicksCacheKey]*topPicksCacheEntry{}},
		topPicksCacheTTL: 15 * time.Minute,
	}
	svc.computeTopPicks = svc.fetchTopPicksForYou
	return svc
}

func (s *animeService) GetCatalogSection(ctx context.Context, userID string, section string) (domain.CatalogSectionData, error) {
	var (
		res domain.TopAnimeResult
		cw  []db.GetContinueWatchingEntriesRow
	)

	g, gCtx := errgroup.WithContext(ctx)

	g.Go(func() error {
		var err error
		res, err = s.catalogSectionMetadata(gCtx, section)
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
		ContinueWatching: continueWatchingDisplays(cw),
	}, nil
}

func continueWatchingDisplays(rows []db.GetContinueWatchingEntriesRow) []domain.ContinueWatchingEntryDisplay {
	out := make([]domain.ContinueWatchingEntryDisplay, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.ContinueWatchingEntryDisplay{GetContinueWatchingEntriesRow: row})
	}
	return out
}

func (s *animeService) catalogSectionMetadata(ctx context.Context, section string) (domain.TopAnimeResult, error) {
	if s.metadata == nil {
		if section == "Continue" {
			return domain.TopAnimeResult{}, nil
		}
		return domain.TopAnimeResult{}, fmt.Errorf("metadata provider is not configured")
	}

	result, err := s.fetchCatalogSection(ctx, section)
	if err != nil {
		return domain.TopAnimeResult{}, err
	}
	res := domain.TopAnimeResult{HasNextPage: result.HasNextPage}
	for _, item := range result.Items {
		res.Animes = append(res.Animes, anilist.ToMetadataAnime(item))
	}
	res.Animes = groupCardsOrOriginal(ctx, s.grouper, res.Animes)
	return res, nil
}

func (s *animeService) fetchCatalogSection(ctx context.Context, section string) (anilist.CatalogResult, error) {
	switch section {
	case "Airing":
		now := time.Now()
		return s.metadata.GetSeason(ctx, anilist.SeasonOptions{Season: currentSeason(now), Year: now.Year(), Page: 1, PerPage: 20})
	case "Popular":
		return s.metadata.GetPopular(ctx, 1, 20)
	default:
		return anilist.CatalogResult{}, nil
	}
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
			return anilist.ToMetadataAnime(anime), nil
		}
		return domain.Anime{}, fmt.Errorf("get anime by id from AniList: %w", err)
	}
	return domain.Anime{}, fmt.Errorf("get anime by id: metadata provider is unavailable")
}

func (s *animeService) SearchAdvanced(ctx context.Context, opts domain.SearchOptions) (domain.SearchResult, error) {
	if s.metadata == nil {
		return domain.SearchResult{}, fmt.Errorf("search anime: metadata provider is unavailable")
	}
	result, err := s.metadata.SearchAdvanced(ctx, opts)
	if err != nil {
		return domain.SearchResult{}, fmt.Errorf("search anime with AniList: %w", err)
	}
	animes := make([]domain.Anime, 0, len(result.Items))
	for _, item := range result.Items {
		animes = append(animes, anilist.ToMetadataAnime(anilist.Anime{ID: item.ID, MALID: item.MALID, Title: item.Title, Format: item.Format, SeasonYear: item.StartYear, CoverImage: item.CoverImage, Relations: item.Relations}))
	}
	animes = groupCardsOrOriginal(ctx, s.grouper, animes)
	return domain.SearchResult{Animes: animes, HasNextPage: result.HasNextPage}, nil
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
		if id := domain.GenreID(name); id > 0 {
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
		animes := make([]domain.Anime, 0, len(items))
		votes := make(map[int]int, len(items))
		for _, item := range items {
			anime := anilist.ToMetadataAnime(anilist.Anime{ID: item.Anime.ID, MALID: item.Anime.MALID, Title: item.Anime.Title, Description: item.Anime.Description, Format: item.Anime.Format, SeasonYear: item.Anime.StartYear, CoverImage: item.Anime.CoverImage, Relations: item.Anime.Relations})
			animes = append(animes, anime)
			votes[item.Anime.MALID] = item.Votes
		}
		animes = groupCardsOrOriginal(ctx, s.grouper, animes)
		out := make([]domain.RecommendationEntry, 0, len(animes))
		for _, anime := range animes {
			var mapped domain.RecommendationEntry
			mapped.Entry.MalID = anime.MalID
			mapped.Entry.Title = anime.DisplayTitle()
			mapped.Entry.Synopsis = anime.Synopsis
			mapped.Entry.Images.Webp.LargeImageURL = anime.Images.Webp.LargeImageURL
			mapped.Votes = votes[anime.MalID]
			out = append(out, mapped)
		}
		return out, nil
	}
	return nil, fmt.Errorf("get recommendations: AniList unavailable")
}

func (s *animeService) WarmDetailSections(id int) {
}

func (s *animeService) GetEpisodes(ctx context.Context, id int, page int) (domain.EpisodesResponse, error) {
	return domain.EpisodesResponse{}, fmt.Errorf("get episodes: episode metadata is provided by AllAnime")
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
			picked := anilist.ToMetadataAnime(result.Items[r.Intn(len(result.Items))])
			grouped := groupCardsOrOriginal(ctx, s.grouper, []domain.Anime{picked})
			if len(grouped) > 0 {
				return grouped[0], nil
			}
			return picked, nil
		}
		return domain.Anime{}, fmt.Errorf("get random anime: AniList unavailable: %w", err)
	}
	return domain.Anime{}, fmt.Errorf("get random anime: metadata provider is unavailable")
}

func (s *animeService) GetAllEpisodes(ctx context.Context, id int) ([]domain.EpisodeData, error) {
	return nil, fmt.Errorf("get all episodes: use the AllAnime episode service")
}
