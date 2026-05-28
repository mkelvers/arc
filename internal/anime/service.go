package anime

import (
	"context"
	"errors"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
	"math/rand"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
)

type animeService struct {
	jikan *jikan.Client
	repo  domain.AnimeRepository
}

func wrapAnimes(in []jikan.Anime) []domain.Anime {
	out := make([]domain.Anime, 0, len(in))
	for _, a := range in {
		out = append(out, domain.Anime{Anime: a})
	}
	return out
}

func NewAnimeService(jikan *jikan.Client, repo domain.AnimeRepository) *animeService {
	return &animeService{jikan: jikan, repo: repo}
}

func (s *animeService) GetCatalogSection(ctx context.Context, userID string, section string) (domain.CatalogSectionData, error) {
	var (
		res jikan.TopAnimeResult
		cw  []db.GetContinueWatchingEntriesRow
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

	if userID != "" && section == "Continue" {
		g.Go(func() error {
			var err error
			cw, err = s.repo.GetContinueWatchingEntries(gCtx, userID)
			return err
		})
	}

	if err := g.Wait(); err != nil {
		return domain.CatalogSectionData{}, err
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

func (s *animeService) GetDiscoverSection(ctx context.Context, userID string, section string) (domain.DiscoverSectionData, error) {
	var res jikan.TopAnimeResult

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

	if err := g.Wait(); err != nil {
		return domain.DiscoverSectionData{}, err
	}

	animes := wrapAnimes(res.Animes)
	if len(animes) > 8 {
		animes = animes[:8]
	}

	return domain.DiscoverSectionData{
		Animes: animes,
	}, nil
}

func (s *animeService) GetDiscoverForYou(ctx context.Context, userID string) (domain.DiscoverSectionData, error) {
	if strings.TrimSpace(userID) == "" {
		return domain.DiscoverSectionData{Animes: []domain.Anime{}}, nil
	}

	watchlist, err := s.repo.GetUserWatchList(ctx, userID)
	if err != nil {
		return domain.DiscoverSectionData{}, err
	}

	seedIDs := make([]int, 0, 5)
	for _, entry := range watchlist {
		status := strings.TrimSpace(entry.Status)
		if status != "watching" && status != "completed" {
			continue
		}
		if entry.AnimeID <= 0 {
			continue
		}
		seedIDs = append(seedIDs, int(entry.AnimeID))
		if len(seedIDs) >= 5 {
			break
		}
	}

	if len(seedIDs) == 0 {
		return domain.DiscoverSectionData{Animes: []domain.Anime{}}, nil
	}

	type ranked struct {
		id    int
		votes int
	}

	recommended := map[int]ranked{}
	var g errgroup.Group
	g.SetLimit(4)

	for _, seedID := range seedIDs {
		g.Go(func() error {
			recs, recErr := s.jikan.GetAnimeRecommendations(ctx, seedID)
			if recErr != nil {
				return recErr
			}
			for _, rec := range recs {
				id := rec.Entry.MalID
				if id <= 0 {
					continue
				}
				if id == seedID {
					continue
				}
				current, ok := recommended[id]
				if !ok {
					recommended[id] = ranked{id: id, votes: rec.Votes}
					continue
				}
				current.votes += rec.Votes
				recommended[id] = current
			}
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return domain.DiscoverSectionData{}, err
	}

	if len(recommended) == 0 {
		return domain.DiscoverSectionData{Animes: []domain.Anime{}}, nil
	}

	rankedIDs := make([]ranked, 0, len(recommended))
	for _, item := range recommended {
		rankedIDs = append(rankedIDs, item)
	}
	sort.Slice(rankedIDs, func(i, j int) bool {
		if rankedIDs[i].votes == rankedIDs[j].votes {
			return rankedIDs[i].id < rankedIDs[j].id
		}
		return rankedIDs[i].votes > rankedIDs[j].votes
	})

	limit := min(len(rankedIDs), 12)

	animes := make([]domain.Anime, limit)
	g.SetLimit(6)

	for i := range limit {
		g.Go(func() error {
			anime, fetchErr := s.jikan.GetAnimeByID(ctx, rankedIDs[i].id)
			if fetchErr != nil {
				observability.Warn(
					"recommendation_anime_fetch_failed",
					"anime",
					"",
					map[string]any{"anime_id": rankedIDs[i].id},
					fetchErr,
				)
				return nil
			}
			animes[i] = domain.Anime{Anime: anime}
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return domain.DiscoverSectionData{}, err
	}

	// Filter out empty animes if any fetch failed silently
	filtered := make([]domain.Anime, 0, len(animes))
	for _, a := range animes {
		if a.MalID > 0 {
			filtered = append(filtered, a)
		}
	}

	return domain.DiscoverSectionData{Animes: filtered}, nil
}

func (s *animeService) GetAiringSchedule(ctx context.Context, userID string) ([]domain.Anime, error) {
	if strings.TrimSpace(userID) == "" {
		return []domain.Anime{}, nil
	}

	watchlist, err := s.repo.GetUserWatchList(ctx, userID)
	if err != nil {
		return nil, err
	}

	ids := make([]int, 0, 50)
	for _, entry := range watchlist {
		status := strings.TrimSpace(entry.Status)
		if status != "watching" && status != "plan_to_watch" {
			continue
		}
		if !entry.Airing.Valid || !entry.Airing.Bool {
			continue
		}
		if entry.AnimeID <= 0 {
			continue
		}
		ids = append(ids, int(entry.AnimeID))
		if len(ids) >= 50 {
			break
		}
	}

	if len(ids) == 0 {
		return []domain.Anime{}, nil
	}

	animes := make([]domain.Anime, 0, len(ids))
	var g errgroup.Group
	g.SetLimit(6)
	var mu sync.Mutex

	for _, id := range ids {
		g.Go(func() error {
			anime, fetchErr := s.jikan.GetAnimeByID(ctx, id)
			if fetchErr != nil {
				return fetchErr
			}
			mu.Lock()
			animes = append(animes, domain.Anime{Anime: anime})
			mu.Unlock()
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		observability.Warn(
			"schedule_partial_fetch_failed",
			"anime",
			"",
			map[string]any{"user_id": userID, "count": len(ids)},
			err,
		)
		return animes, nil
	}

	return animes, nil
}

func (s *animeService) GetAnimeByID(ctx context.Context, id int) (domain.Anime, error) {
	anime, err := s.jikan.GetAnimeByID(ctx, id)
	if err != nil {
		return domain.Anime{}, err
	}
	return domain.Anime{Anime: anime}, nil
}

func (s *animeService) SearchAdvanced(ctx context.Context, q, animeType, status, orderBy, sort string, genres []int, studioID int, sfw bool, page, limit int) (jikan.SearchResult, error) {
	return s.jikan.SearchAdvanced(ctx, q, animeType, status, orderBy, sort, genres, studioID, sfw, page, limit)
}

func (s *animeService) GetProducerNameByID(ctx context.Context, id int) (string, error) {
	res, err := s.jikan.GetProducerByID(ctx, id)
	if err != nil {
		return "", err
	}
	for _, t := range res.Data.Titles {
		if t.Title != "" {
			return t.Title, nil
		}
	}
	return "", nil
}

func (s *animeService) GetProducers(ctx context.Context, query string, page int, limit int) (jikan.ProducerListResult, error) {
	return s.jikan.GetProducers(ctx, query, page, limit)
}

func (s *animeService) GetGenres(ctx context.Context) ([]domain.Genre, error) {
	genres, err := s.jikan.GetAnimeGenres(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Genre, 0, len(genres))
	for _, g := range genres {
		if g.MalID <= 0 || strings.TrimSpace(g.Name) == "" {
			continue
		}
		out = append(out, domain.Genre{MalID: g.MalID, Name: g.Name})
	}
	return out, nil
}

func (s *animeService) GetCharacters(ctx context.Context, id int) ([]domain.CharacterEntry, error) {
	items, err := s.jikan.GetAnimeCharacters(ctx, id)
	if err != nil {
		return nil, err
	}

	out := make([]domain.CharacterEntry, 0, len(items))
	for _, it := range items {
		var mapped domain.CharacterEntry
		mapped.Character.MalID = it.Character.MalID
		mapped.Character.URL = it.Character.URL
		mapped.Character.Name = it.Character.Name
		mapped.Character.Images.Jpg.ImageURL = it.Character.Images.Jpg.ImageURL
		mapped.Character.Images.Webp.ImageURL = it.Character.Images.Webp.ImageURL
		mapped.Character.Images.Webp.SmallImageURL = it.Character.Images.Webp.SmallImageURL
		mapped.Role = it.Role

		if len(it.VoiceActors) > 0 {
			mapped.VoiceActors = make([]domain.CharacterVoiceActor, 0, len(it.VoiceActors))
			for _, va := range it.VoiceActors {
				var mappedVA domain.CharacterVoiceActor
				mappedVA.Language = va.Language
				mappedVA.Person.MalID = va.Person.MalID
				mappedVA.Person.URL = va.Person.URL
				mappedVA.Person.Name = va.Person.Name
				mappedVA.Person.Images.Jpg.ImageURL = va.Person.Images.Jpg.ImageURL
				mapped.VoiceActors = append(mapped.VoiceActors, mappedVA)
			}
		}

		out = append(out, mapped)
	}

	return out, nil
}

func (s *animeService) GetRecommendations(ctx context.Context, id int) ([]domain.RecommendationEntry, error) {
	items, err := s.jikan.GetAnimeRecommendations(ctx, id)
	if err != nil {
		return nil, err
	}

	out := make([]domain.RecommendationEntry, 0, len(items))
	for _, it := range items {
		var mapped domain.RecommendationEntry
		mapped.Entry.MalID = it.Entry.MalID
		mapped.Entry.URL = it.Entry.URL
		mapped.Entry.Title = it.Entry.Title
		mapped.Entry.Images.Webp.LargeImageURL = it.Entry.Images.Webp.LargeImageURL
		mapped.URL = it.URL
		mapped.Votes = it.Votes
		out = append(out, mapped)
	}
	return out, nil
}

func (s *animeService) GetRelations(ctx context.Context, id int) ([]jikan.RelationEntry, error) {
	return s.jikan.GetFullRelations(ctx, id)
}

func (s *animeService) GetEpisodes(ctx context.Context, id int, page int) (jikan.EpisodesResponse, error) {
	return s.jikan.GetEpisodes(ctx, id, page)
}

func (s *animeService) GetStaff(ctx context.Context, id int) ([]domain.StaffEntry, error) {
	items, err := s.jikan.GetAnimeStaff(ctx, id)
	if err != nil {
		return nil, err
	}

	out := make([]domain.StaffEntry, 0, len(items))
	for _, it := range items {
		var mapped domain.StaffEntry
		mapped.Person.MalID = it.Person.MalID
		mapped.Person.URL = it.Person.URL
		mapped.Person.Name = it.Person.Name
		mapped.Person.Images.Jpg.ImageURL = it.Person.Images.Jpg.ImageURL
		mapped.Positions = append([]string(nil), it.Positions...)
		out = append(out, mapped)
	}
	return out, nil
}

func (s *animeService) GetStatistics(ctx context.Context, id int) (domain.Statistics, error) {
	stats, err := s.jikan.GetAnimeStatistics(ctx, id)
	if err != nil {
		return domain.Statistics{}, err
	}

	out := domain.Statistics{
		Watching:    stats.Watching,
		Completed:   stats.Completed,
		OnHold:      stats.OnHold,
		Dropped:     stats.Dropped,
		PlanToWatch: stats.PlanToWatch,
		Total:       stats.Total,
	}
	if len(stats.Scores) > 0 {
		out.Scores = make([]domain.StatisticsScore, 0, len(stats.Scores))
		for _, s := range stats.Scores {
			out.Scores = append(out.Scores, domain.StatisticsScore{Score: s.Score, Votes: s.Votes, Percentage: s.Percentage})
		}
	}
	return out, nil
}

func (s *animeService) GetThemes(ctx context.Context, id int) (domain.ThemesData, error) {
	themes, err := s.jikan.GetAnimeThemes(ctx, id)
	if err != nil {
		return domain.ThemesData{}, err
	}
	return domain.ThemesData{
		Openings: append([]string(nil), themes.Openings...),
		Endings:  append([]string(nil), themes.Endings...),
	}, nil
}

func (s *animeService) GetReviews(ctx context.Context, id int, page int) ([]domain.ReviewEntry, bool, error) {
	data, pag, err := s.jikan.GetAnimeReviews(ctx, id, page)
	if err != nil {
		return nil, false, err
	}
	out := make([]domain.ReviewEntry, 0, len(data))
	for _, it := range data {
		mapped := domain.ReviewEntry{
			MalID:         it.MalID,
			URL:           it.URL,
			Type:          it.Type,
			Date:          it.Date,
			Review:        it.Review,
			Score:         it.Score,
			Tags:          append([]string(nil), it.Tags...),
			IsSpoiler:     it.IsSpoiler,
			IsPreliminary: it.IsPreliminary,
			EpisodesSeen:  it.EpisodesSeen,
			Reactions: domain.ReviewReactions{
				Overall:     it.Reactions.Overall,
				Nice:        it.Reactions.Nice,
				LoveIt:      it.Reactions.LoveIt,
				Funny:       it.Reactions.Funny,
				Confusing:   it.Reactions.Confusing,
				Informative: it.Reactions.Informative,
				WellWritten: it.Reactions.WellWritten,
				Creative:    it.Reactions.Creative,
			},
		}
		mapped.User.URL = it.User.URL
		mapped.User.Username = it.User.Username
		mapped.User.Images.Jpg.ImageURL = it.User.Images.Jpg.ImageURL
		mapped.User.Images.Webp.ImageURL = it.User.Images.Webp.ImageURL
		out = append(out, mapped)
	}

	return out, pag.HasNextPage, nil
}

func (s *animeService) GetRandomAnime(ctx context.Context) (domain.Anime, error) {
	randomCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	anime, err := s.jikan.GetRandomAnime(randomCtx)
	if err == nil {
		return domain.Anime{Anime: anime}, nil
	}

	for _, fallback := range []func(context.Context, int) (jikan.TopAnimeResult, error){
		s.jikan.GetSeasonsNow,
		s.jikan.GetTopAnime,
		s.jikan.GetSeasonsUpcoming,
	} {
		res, fallbackErr := fallback(ctx, 1)
		if fallbackErr != nil || len(res.Animes) == 0 {
			continue
		}
		r := rand.New(rand.NewSource(time.Now().UnixNano()))
		return domain.Anime{Anime: res.Animes[r.Intn(len(res.Animes))]}, nil
	}

	return domain.Anime{}, err
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
