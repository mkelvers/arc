package service

import (
	"context"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"

	"golang.org/x/sync/errgroup"
)

type animeService struct {
	jikan *jikan.Client
	repo  domain.AnimeRepository
}

func NewAnimeService(jikan *jikan.Client, repo domain.AnimeRepository) domain.AnimeService {
	return &animeService{jikan: jikan, repo: repo}
}

func (s *animeService) GetCatalogSection(ctx context.Context, userID string, section string) (map[string]any, error) {
	var (
		res       jikan.TopAnimeResult
		cw        []db.GetContinueWatchingEntriesRow
		watchlist []db.GetUserWatchListRow
	)

	g, gCtx := errgroup.WithContext(ctx)

	g.Go(func() error {
		var err error
		switch section {
		case "Airing":
			res, err = s.jikan.GetSeasonsNow(gCtx, 1)
		case "Popular":
			res, err = s.jikan.GetTopAnime(gCtx, 1)
		}
		return err
	})

	if userID != "" {
		g.Go(func() error {
			if section == "Continue" {
				var err error
				cw, err = s.repo.GetContinueWatchingEntries(gCtx, userID)
				return err
			}
			return nil
		})
		g.Go(func() error {
			var err error
			watchlist, err = s.repo.GetUserWatchList(gCtx, userID)
			return err
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	animes := res.Animes
	if len(animes) > 6 {
		animes = animes[:6]
	}

	watchlistMap := make(map[int64]bool)
	for _, entry := range watchlist {
		watchlistMap[entry.AnimeID] = true
	}

	return map[string]any{
		"Animes":           animes,
		"ContinueWatching": cw,
		"WatchlistMap":     watchlistMap,
	}, nil
}

func (s *animeService) GetDiscoverSection(ctx context.Context, userID string, section string) (map[string]any, error) {
	var (
		res       jikan.TopAnimeResult
		watchlist []db.GetUserWatchListRow
	)

	g, gCtx := errgroup.WithContext(ctx)

	g.Go(func() error {
		var err error
		switch section {
		case "Trending":
			res, err = s.jikan.GetSeasonsNow(gCtx, 1)
		case "Upcoming":
			res, err = s.jikan.GetSeasonsUpcoming(gCtx, 1)
		case "Top":
			res, err = s.jikan.GetTopAnime(gCtx, 1)
		}
		return err
	})

	if userID != "" {
		g.Go(func() error {
			var err error
			watchlist, err = s.repo.GetUserWatchList(gCtx, userID)
			return err
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	animes := res.Animes
	if len(animes) > 8 {
		animes = animes[:8]
	}

	watchlistMap := make(map[int64]bool)
	for _, entry := range watchlist {
		watchlistMap[entry.AnimeID] = true
	}

	return map[string]any{
		"Animes":       animes,
		"WatchlistMap": watchlistMap,
	}, nil
}

func (s *animeService) GetAnimeByID(ctx context.Context, id int) (domain.Anime, error) {
	return s.jikan.GetAnimeByID(ctx, id)
}

func (s *animeService) SearchAdvanced(ctx context.Context, q, animeType, status, orderBy, sort string, genres []int, sfw bool, page, limit int) (jikan.SearchResult, error) {
	return s.jikan.SearchAdvanced(ctx, q, animeType, status, orderBy, sort, genres, sfw, page, limit)
}

func (s *animeService) GetGenres(ctx context.Context) ([]domain.Genre, error) {
	return s.jikan.GetAnimeGenres(ctx)
}

func (s *animeService) GetCharacters(ctx context.Context, id int) ([]domain.Character, error) {
	return s.jikan.GetAnimeCharacters(ctx, id)
}

func (s *animeService) GetRecommendations(ctx context.Context, id int) ([]domain.Recommendation, error) {
	return s.jikan.GetAnimeRecommendations(ctx, id)
}

func (s *animeService) GetRelations(ctx context.Context, id int) ([]jikan.RelationEntry, error) {
	return s.jikan.GetFullRelations(ctx, id)
}

func (s *animeService) GetEpisodes(ctx context.Context, id int, page int) (jikan.EpisodesResponse, error) {
	return s.jikan.GetEpisodes(ctx, id, page)
}

func (s *animeService) GetStaff(ctx context.Context, id int) ([]domain.StaffEntry, error) {
	return s.jikan.GetAnimeStaff(ctx, id)
}

func (s *animeService) GetStatistics(ctx context.Context, id int) (domain.Statistics, error) {
	return s.jikan.GetAnimeStatistics(ctx, id)
}

func (s *animeService) GetThemes(ctx context.Context, id int) (domain.ThemesData, error) {
	return s.jikan.GetAnimeThemes(ctx, id)
}

func (s *animeService) GetReviews(ctx context.Context, id int, page int) ([]domain.ReviewEntry, bool, error) {
	data, pag, err := s.jikan.GetAnimeReviews(ctx, id, page)
	if err != nil {
		return nil, false, err
	}
	return data, pag.HasNextPage, nil
}

func (s *animeService) GetRandomAnime(ctx context.Context) (domain.Anime, error) {
	return s.jikan.GetRandomAnime(ctx)
}

func (s *animeService) GetAllEpisodes(ctx context.Context, id int) ([]domain.EpisodeData, error) {
	episodes, err := s.jikan.GetAllEpisodes(ctx, id)
	if err != nil {
		return nil, err
	}
	result := make([]domain.EpisodeData, len(episodes))
	for i, ep := range episodes {
		result[i] = domain.EpisodeData{
			MalID:    ep.MalID,
			Title:    ep.Title,
			IsFiller: ep.Filler,
			IsRecap:  ep.Recap,
		}
	}
	return result, nil
}
