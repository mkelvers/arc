package anime

import (
	"slices"
	"testing"

	"mal/integrations/watchorder"
	"mal/internal/domain"
)

func TestFranchiseEntriesPreserveProviderOrderAndCurrentRelease(t *testing.T) {
	ordered := []watchorder.WatchOrderEntry{
		{ID: 37430, Type: "TV"},
		{ID: 39607, Type: "OVA"},
		{ID: 39551, Type: "TV"},
		{ID: 49877, Type: "Movie"},
		{ID: 60000, Type: "Music"},
		{ID: 60001, Type: "PV"},
		{ID: 39551, Type: "TV"},
	}
	animes := []domain.Anime{
		{MalID: 49877, TitleEnglish: "Scarlet Bond"},
		{MalID: 39551, TitleEnglish: "Season 2"},
		{MalID: 37430, TitleEnglish: "Season 1"},
		{MalID: 39607, TitleEnglish: "OVA"},
		{MalID: 60000, TitleEnglish: "Music"},
		{MalID: 60001, TitleEnglish: "Preview"},
	}

	entries := franchiseEntriesFromAnimes(ordered, animes, 39551)
	if len(entries) != 4 {
		t.Fatalf("len(entries) = %d, want 4", len(entries))
	}
	entryIDs := []int{entries[0].Anime.MalID, entries[1].Anime.MalID, entries[2].Anime.MalID, entries[3].Anime.MalID}
	if !slices.Equal(entryIDs, []int{37430, 39607, 39551, 49877}) {
		t.Fatalf("provider order was not preserved: %+v", entries)
	}
	current := []bool{entries[0].Current, entries[1].Current, entries[2].Current, entries[3].Current}
	if !slices.Equal(current, []bool{false, false, true, false}) {
		t.Fatalf("current release marker is wrong: %+v", entries)
	}
	if entries[3].Type != "MOVIE" {
		t.Fatalf("type = %q, want MOVIE", entries[3].Type)
	}
}

func TestFranchiseEntriesForDisplayDefaultsToTVAndMovies(t *testing.T) {
	entries := []animeFranchiseEntry{
		{Anime: domain.Anime{MalID: 1}, Type: "TV", Primary: true},
		{Anime: domain.Anime{MalID: 2}, Type: "OVA"},
		{Anime: domain.Anime{MalID: 3}, Type: "MOVIE", Primary: true},
	}

	visible, hasExtras := franchiseEntriesForDisplay(entries, false)
	if !hasExtras || len(visible) != 2 || visible[0].Anime.MalID != 1 || visible[1].Anime.MalID != 3 {
		t.Fatalf("default entries = %+v, hasExtras = %t", visible, hasExtras)
	}

	visible, hasExtras = franchiseEntriesForDisplay(entries, true)
	if !hasExtras || len(visible) != 3 {
		t.Fatalf("entries with extras = %+v, hasExtras = %t", visible, hasExtras)
	}
}
