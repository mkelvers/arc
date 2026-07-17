package anime

import (
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
		{ID: 39551, Type: "TV"},
	}
	animes := []domain.Anime{
		{MalID: 49877, TitleEnglish: "Scarlet Bond"},
		{MalID: 39551, TitleEnglish: "Season 2"},
		{MalID: 37430, TitleEnglish: "Season 1"},
	}

	entries := franchiseEntriesFromAnimes(ordered, animes, 39551)
	if len(entries) != 3 {
		t.Fatalf("len(entries) = %d, want 3", len(entries))
	}
	if entries[0].Anime.MalID != 37430 || entries[1].Anime.MalID != 39551 || entries[2].Anime.MalID != 49877 {
		t.Fatalf("provider order was not preserved: %+v", entries)
	}
	if !entries[1].Current || entries[0].Current || entries[2].Current {
		t.Fatalf("current release marker is wrong: %+v", entries)
	}
	if entries[2].Type != "MOVIE" {
		t.Fatalf("type = %q, want MOVIE", entries[2].Type)
	}
}
