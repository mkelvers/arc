package anime

import (
	"context"
	"fmt"
	"strings"

	"mal/integrations/watchorder"
	"mal/internal/domain"
)

type animeFranchiseEntry struct {
	Anime     domain.Anime
	Type      string
	Current   bool
	Secondary bool
}

func (s *animeService) GetFranchise(ctx context.Context, id int) ([]animeFranchiseEntry, error) {
	if s.metadata == nil || s.watchOrder == nil {
		return nil, fmt.Errorf("get franchise: providers are unavailable")
	}
	ordered, err := s.watchOrder.FetchByAnimeID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get franchise order: %w", err)
	}
	return s.franchiseEntries(ctx, ordered.WatchOrder, id)
}

func (s *animeService) franchiseEntries(ctx context.Context, ordered []watchorder.WatchOrderEntry, currentID int) ([]animeFranchiseEntry, error) {
	ids := make([]int, 0, len(ordered))
	for _, entry := range ordered {
		if entry.ID > 0 {
			ids = append(ids, entry.ID)
		}
	}
	animes, err := s.GetAnimeBatchByID(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("hydrate franchise entries: %w", err)
	}
	return franchiseEntriesFromAnimes(ordered, animes, currentID), nil
}

func franchiseEntriesFromAnimes(ordered []watchorder.WatchOrderEntry, animes []domain.Anime, currentID int) []animeFranchiseEntry {
	byID := make(map[int]domain.Anime, len(animes))
	for _, anime := range animes {
		byID[anime.MalID] = anime
	}
	entries := make([]animeFranchiseEntry, 0, len(ordered))
	seen := make(map[int]bool, len(ordered))
	for _, item := range ordered {
		anime, ok := byID[item.ID]
		if !ok || seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		entries = append(entries, animeFranchiseEntry{
			Anime:     anime,
			Type:      strings.ToUpper(strings.TrimSpace(item.Type)),
			Current:   item.ID == currentID,
			Secondary: item.Secondary,
		})
	}
	return entries
}
