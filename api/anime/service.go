package anime

import (
	"context"
	"mal/integrations/jikan"
	"mal/internal/db"

	"golang.org/x/sync/errgroup"
)

type Service struct {
	jikanClient *jikan.Client
	db          database.Querier
}

func NewService(jikanClient *jikan.Client, db database.Querier) *Service {
	return &Service{jikanClient: jikanClient, db: db}
}

func (s *Service) GetCatalogSection(ctx context.Context, userID string, section string) (map[string]any, error) {
	var (
		res       jikan.TopAnimeResult
		cw        []database.GetContinueWatchingEntriesRow
		watchlist []database.GetUserWatchListRow
		err       error
	)

	g, gCtx := errgroup.WithContext(ctx)

	g.Go(func() error {
		switch section {
		case "Airing":
			res, err = s.jikanClient.GetSeasonsNow(gCtx, 1)
		case "Popular":
			res, err = s.jikanClient.GetTopAnime(gCtx, 1)
		}
		return err
	})

	if userID != "" {
		g.Go(func() error {
			if section == "Continue" {
				var err error
				cw, err = s.db.GetContinueWatchingEntries(gCtx, userID)
				return err
			}
			return nil
		})
		g.Go(func() error {
			var err error
			watchlist, err = s.db.GetUserWatchList(gCtx, userID)
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

func (s *Service) GetDiscoverSection(ctx context.Context, userID string, section string) (map[string]any, error) {
	var (
		res       jikan.TopAnimeResult
		watchlist []database.GetUserWatchListRow
		err       error
	)

	g, gCtx := errgroup.WithContext(ctx)

	g.Go(func() error {
		switch section {
		case "Trending":
			res, err = s.jikanClient.GetSeasonsNow(gCtx, 1)
		case "Upcoming":
			res, err = s.jikanClient.GetSeasonsUpcoming(gCtx, 1)
		case "Top":
			res, err = s.jikanClient.GetTopAnime(gCtx, 1)
		}
		return err
	})

	if userID != "" {
		g.Go(func() error {
			var err error
			watchlist, err = s.db.GetUserWatchList(gCtx, userID)
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

func (s *Service) filterUnique(animes []jikan.Anime, seen map[int]bool, limit int) []jikan.Anime {
	unique := make([]jikan.Anime, 0)
	for _, a := range animes {
		if !seen[a.MalID] {
			seen[a.MalID] = true
			unique = append(unique, a)
		}
		if len(unique) >= limit {
			break
		}
	}
	return unique
}
