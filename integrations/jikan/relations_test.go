package jikan

import (
	"mal/integrations/watchorder"
	"testing"
)

func TestNormalizeWatchOrderMode(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  WatchOrderMode
	}{
		{name: "empty defaults main", input: "", want: WatchOrderModeMain},
		{name: "main", input: "main", want: WatchOrderModeMain},
		{name: "complete", input: "complete", want: WatchOrderModeComplete},
		{name: "case and whitespace", input: " COMPLETE ", want: WatchOrderModeComplete},
		{name: "unknown defaults main", input: "everything", want: WatchOrderModeMain},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			got := NormalizeWatchOrderMode(testCase.input)
			if got != testCase.want {
				t.Fatalf("expected %q, got %q", testCase.want, got)
			}
		})
	}
}

func TestBuildAllowedWatchOrderEntriesKeepsDefaultTypesWhenTVExists(t *testing.T) {
	result := watchorder.WatchOrderResult{
		WatchOrder: []watchorder.WatchOrderEntry{
			{ID: 1, Type: "TV"},
			{ID: 2, Type: "Special"},
			{ID: 3, Type: " Movie "},
			{ID: 4, Type: "ONA"},
		},
	}

	entries, seen := allowedWatchOrder(result, WatchOrderModeMain)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	if entries[0].ID != 1 || entries[1].ID != 3 {
		t.Fatalf("unexpected entries: %+v", entries)
	}

	if !seen[1] || !seen[3] || seen[2] || seen[4] {
		t.Fatalf("unexpected seen map: %+v", seen)
	}
}

func TestBuildAllowedWatchOrderEntriesIncludesAllTypesWhenNoTVExists(t *testing.T) {
	result := watchorder.WatchOrderResult{
		WatchOrder: []watchorder.WatchOrderEntry{
			{ID: 1, Type: "ONA"},
			{ID: 2, Type: "Special"},
			{ID: 3, Type: "Movie"},
			{ID: 1, Type: "ONA"},
		},
	}

	entries, seen := allowedWatchOrder(result, WatchOrderModeMain)
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}

	if entries[0].ID != 1 || entries[1].ID != 2 || entries[2].ID != 3 {
		t.Fatalf("unexpected entries: %+v", entries)
	}

	if !seen[1] || !seen[2] || !seen[3] {
		t.Fatalf("unexpected seen map: %+v", seen)
	}
}

func TestBuildAllowedWatchOrderEntriesIncludesAllTypesInCompleteMode(t *testing.T) {
	result := watchorder.WatchOrderResult{
		WatchOrder: []watchorder.WatchOrderEntry{
			{ID: 1, Type: "TV"},
			{ID: 2, Type: "Special"},
			{ID: 3, Type: "ONA"},
			{ID: 4, Type: "Movie"},
		},
	}

	entries, seen := allowedWatchOrder(result, WatchOrderModeComplete)
	if len(entries) != 4 {
		t.Fatalf("expected 4 entries, got %d", len(entries))
	}

	for index, entry := range entries {
		wantID := index + 1
		if entry.ID != wantID {
			t.Fatalf("expected entry %d to have id %d, got %+v", index, wantID, entry)
		}
	}

	if !seen[1] || !seen[2] || !seen[3] || !seen[4] {
		t.Fatalf("unexpected seen map: %+v", seen)
	}
}

func TestWatchOrderTypeLabel(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "tv", input: "tv", want: "TV"},
		{name: "movie", input: "movie", want: "Movie"},
		{name: "ona", input: "ona", want: "ONA"},
		{name: "ova", input: "ova", want: "OVA"},
		{name: "trimmed passthrough", input: "  tv special  ", want: "tv special"},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			got := watchOrderTypeLabel(testCase.input)
			if got != testCase.want {
				t.Fatalf("expected %q, got %q", testCase.want, got)
			}
		})
	}
}
