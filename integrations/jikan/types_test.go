package jikan

import "testing"

func TestAnimeDisplayTitlePrefersTitleBeforeJapanese(t *testing.T) {
	anime := Anime{
		Title:         "Cyberpunk: Edgerunners",
		TitleJapanese: "サイバーパンク エッジランナーズ",
	}

	if got := anime.DisplayTitle(); got != "Cyberpunk: Edgerunners" {
		t.Fatalf("DisplayTitle() = %q, want default title", got)
	}
}

func TestAnimeDisplayTitleFallsBackToFirstTitleEntryBeforeJapanese(t *testing.T) {
	anime := Anime{
		TitleJapanese: "サイバーパンク エッジランナーズ",
		Titles: []TitleEntry{
			{Type: "Default", Title: "Cyberpunk: Edgerunners"},
		},
	}

	if got := anime.DisplayTitle(); got != "Cyberpunk: Edgerunners" {
		t.Fatalf("DisplayTitle() = %q, want first title entry", got)
	}
}
