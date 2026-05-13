package service

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"sort"
	"strconv"
	"strings"
)

type playbackService struct {
	repo      domain.PlaybackRepository
	providers []domain.Provider
	jikan     *jikan.Client
}

func NewPlaybackService(repo domain.PlaybackRepository, providers []domain.Provider, jikan *jikan.Client) domain.PlaybackService {
	return &playbackService{repo: repo, providers: providers, jikan: jikan}
}

func (s *playbackService) BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (map[string]any, error) {
	// 1. Get Anime details for total episodes and titles
	anime, err := s.jikan.GetAnimeByID(ctx, animeID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch anime: %w", err)
	}

	// 2. Resolve streams from providers
	var result *domain.StreamResult
	for _, p := range s.providers {
		res, err := p.GetStreams(ctx, animeID, episode, mode)
		if err == nil && res != nil {
			result = res
			break
		}
	}

	if result == nil {
		return nil, fmt.Errorf("no streams found")
	}

	// 3. Get start time from progress
	startTime := 0.0
	var watchlistStatus string
	if userID != "" {
		entry, err := s.repo.GetWatchListEntry(ctx, db.GetWatchListEntryParams{
			UserID:  userID,
			AnimeID: int64(animeID),
		})
		if err == nil {
			watchlistStatus = entry.Status
			if entry.CurrentEpisode.Valid && strconv.FormatInt(entry.CurrentEpisode.Int64, 10) == episode {
				startTime = entry.CurrentTimeSeconds
			}
		}
	}

	// 4. Get Episodes list
	jikanEpisodes, err := s.jikan.GetAllEpisodes(ctx, animeID)
	if err != nil {
		log.Printf("failed to fetch episodes from jikan: %v", err)
	}

	// Fallback/Fill episodes if needed
	totalCount := anime.Episodes
	if len(jikanEpisodes) < totalCount {
		epMap := make(map[int]jikan.Episode)
		for _, ep := range jikanEpisodes {
			epMap[ep.MalID] = ep
		}
		for i := 1; i <= totalCount; i++ {
			if _, ok := epMap[i]; !ok {
				jikanEpisodes = append(jikanEpisodes, jikan.Episode{
					MalID:   i,
					Episode: fmt.Sprintf("Episode %d", i),
					Title:   fmt.Sprintf("Episode %d", i),
				})
			}
		}
	}
	sort.Slice(jikanEpisodes, func(i, j int) bool {
		return jikanEpisodes[i].MalID < jikanEpisodes[j].MalID
	})

	domainEpisodes := make([]domain.EpisodeData, len(jikanEpisodes))
	for i, ep := range jikanEpisodes {
		domainEpisodes[i] = domain.EpisodeData{
			MalID:    ep.MalID,
			Title:    ep.Title,
			IsFiller: ep.Filler,
			IsRecap:  ep.Recap,
		}
	}

	// 5. Build provider data
	// AllAnime currently returns one stream in result.URL
	// We wrap it for the template
	streams := []domain.ProviderStream{
		{
			Name:      "Primary",
			URL:       result.URL,
			Quality:   "Auto",
			MalID:     animeID,
			IsCurrent: true,
		},
	}

	modeSources := map[string]any{
		mode: map[string]any{
			"url":       result.URL,
			"referer":   result.Referer,
			"subtitles": result.Subtitles,
		},
	}

	// 6. Resolve relations/seasons
	relations, _ := s.jikan.GetFullRelations(ctx, animeID)
	type SeasonEntry struct {
		MalID     int    `json:"mal_id"`
		Title     string `json:"title"`
		Prefix    string `json:"prefix"`
		IsCurrent bool   `json:"is_current"`
	}
	var seasons []SeasonEntry
	tvCounter := 1
	for _, rel := range relations {
		if strings.ToLower(rel.Anime.Type) == "tv" || strings.ToLower(rel.Anime.Type) == "movie" {
			seasons = append(seasons, SeasonEntry{
				MalID:     rel.Anime.MalID,
				Title:     rel.Anime.DisplayTitle(),
				Prefix:    rel.Relation,
				IsCurrent: rel.IsCurrent,
			})
			if rel.Relation == "TV" {
				seasons[len(seasons)-1].Prefix = fmt.Sprintf("S%d", tvCounter)
				tvCounter++
			}
		}
	}

	// Final assembly
	watchData := map[string]any{
		"MalID":            animeID,
		"Title":            anime.DisplayTitle(),
		"CurrentEpisode":   episode,
		"StartTimeSeconds": startTime,
		"Episodes":        domainEpisodes,
		"Providers": []domain.ProviderData{
			{Streams: streams},
		},
		"ModeSources":    modeSources,
		"InitialMode":    mode,
		"AvailableModes": []string{"sub", "dub"},
	}

	return map[string]any{
		"WatchData":       watchData,
		"Anime":           anime,
		"Episodes":        domainEpisodes,
		"CurrentEpID":     episode,
		"WatchlistStatus": watchlistStatus,
		"Seasons":         seasons,
	}, nil
}

func (s *playbackService) SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error {
	params := db.SaveWatchProgressParams{
		UserID:             userID,
		AnimeID:            animeID,
		CurrentEpisode:     sql.NullInt64{Int64: int64(episode), Valid: true},
		CurrentTimeSeconds: timeSeconds,
	}
	return s.repo.SaveWatchProgress(ctx, params)
}
