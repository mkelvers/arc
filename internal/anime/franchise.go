package anime

import (
	"context"
	"fmt"
	"strings"
	"time"

	"mal/integrations/watchorder"
	"mal/internal/domain"
)

type animeFranchiseEntry struct {
	Anime   domain.Anime
	Type    string
	Current bool
	Primary bool
	Badge   string
}

type franchiseExtraOption struct {
	Type     string
	Label    string
	Selected bool
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
	now := time.Now()
	for _, item := range ordered {
		anime, ok := byID[item.ID]
		if !ok || seen[item.ID] {
			continue
		}
		entryType := normalizedFranchiseType(item.Type, anime.Type)
		if !isVisibleFranchiseType(entryType) {
			continue
		}
		seen[item.ID] = true
		entries = append(entries, animeFranchiseEntry{
			Anime:   anime,
			Type:    entryType,
			Current: item.ID == currentID,
			Primary: entryType == "TV" || entryType == "MOVIE",
			Badge:   franchiseReleaseBadge(anime, now),
		})
	}
	return entries
}

func franchiseReleaseBadge(anime domain.Anime, now time.Time) string {
	if strings.EqualFold(strings.TrimSpace(anime.Status), "Not yet aired") {
		return "Not yet aired"
	}
	if startsAfter(anime.Aired.From, now) {
		return "Not yet aired"
	}
	return ""
}

func startsAfter(value string, now time.Time) bool {
	if strings.TrimSpace(value) == "" {
		return false
	}
	startedAt, err := time.Parse(time.RFC3339, value)
	return err == nil && now.Before(startedAt)
}

func normalizedFranchiseType(providerType, animeType string) string {
	entryType := strings.ToUpper(strings.TrimSpace(providerType))
	if entryType == "" {
		entryType = strings.ToUpper(strings.TrimSpace(animeType))
	}
	return entryType
}

func isVisibleFranchiseType(entryType string) bool {
	switch entryType {
	case "TV", "MOVIE", "OVA", "ONA", "SPECIAL", "TV SPECIAL", "MUSIC":
		return true
	default:
		return false
	}
}

func franchiseEntriesForDisplay(entries []animeFranchiseEntry, selectedExtras map[string]bool) ([]animeFranchiseEntry, []franchiseExtraOption) {
	visible := make([]animeFranchiseEntry, 0, len(entries))
	for _, entry := range entries {
		if !entry.Primary {
			if !selectedExtras[entry.Type] {
				continue
			}
		}
		visible = append(visible, entry)
	}
	return visible, franchiseExtraOptions(entries, selectedExtras)
}

func franchiseExtraOptions(entries []animeFranchiseEntry, selectedExtras map[string]bool) []franchiseExtraOption {
	seen := make(map[string]bool)
	options := make([]franchiseExtraOption, 0, len(entries))
	for _, entry := range entries {
		if entry.Primary || seen[entry.Type] {
			continue
		}
		seen[entry.Type] = true
		options = append(options, franchiseExtraOption{
			Type:     entry.Type,
			Label:    franchiseTypeLabel(entry.Type),
			Selected: selectedExtras[entry.Type],
		})
	}
	return options
}

func franchiseTypeLabel(entryType string) string {
	switch entryType {
	case "TV SPECIAL":
		return "TV specials"
	case "SPECIAL":
		return "Specials"
	case "MOVIE":
		return "Movies"
	case "MUSIC":
		return "Music"
	default:
		return entryType
	}
}
