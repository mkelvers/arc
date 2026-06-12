package db

import (
	"database/sql"
	"testing"
)

func TestDisplayTitlePrefersOriginalBeforeJapanese(t *testing.T) {
	got := DisplayTitle(
		sql.NullString{},
		sql.NullString{String: "サイバーパンク エッジランナーズ", Valid: true},
		"Cyberpunk: Edgerunners",
	)

	if got != "Cyberpunk: Edgerunners" {
		t.Fatalf("DisplayTitle() = %q, want original title", got)
	}
}

func TestDisplayTitlePrefersEnglish(t *testing.T) {
	got := DisplayTitle(
		sql.NullString{String: "Frieren: Beyond Journey's End", Valid: true},
		sql.NullString{String: "葬送のフリーレン", Valid: true},
		"Sousou no Frieren",
	)

	if got != "Frieren: Beyond Journey's End" {
		t.Fatalf("DisplayTitle() = %q, want English title", got)
	}
}
