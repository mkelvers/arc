package templates

import "testing"

func TestBrowseURLPreservesAndOverridesParams(t *testing.T) {
	t.Parallel()

	got, err := browseURL(
		browseURLParams{
			Query:   "full metal",
			Type:    "tv",
			Status:  "airing",
			OrderBy: "score",
			Sort:    "desc",
			Studio:  42,
			SFW:     true,
			Genres:  []int{1, 2},
			Page:    3,
		},
		map[string]any{
			"status": "",
			"sort":   "asc",
			"page":   4,
		},
	)
	if err != nil {
		t.Fatalf("browseURL error: %v", err)
	}

	want := "/browse?genres=1&genres=2&order_by=score&page=4&q=full+metal&sfw=true&sort=asc&studio=42&type=tv"
	if got != want {
		t.Fatalf("unexpected url\nwant: %s\ngot:  %s", want, got)
	}
}

func TestBrowseURLClearsAndEncodesValues(t *testing.T) {
	t.Parallel()

	got, err := browseURL(
		map[string]any{
			"Query":  "K-On! & friends",
			"Studio": 99,
			"SFW":    false,
			"Genres": []int{7, 9},
		},
		map[string]any{
			"studio": "",
			"genres": []int{5},
		},
	)
	if err != nil {
		t.Fatalf("browseURL error: %v", err)
	}

	want := "/browse?genres=5&q=K-On%21+%26+friends&sfw=false"
	if got != want {
		t.Fatalf("unexpected url\nwant: %s\ngot:  %s", want, got)
	}
}

func TestBrowseURLSupportsNamedMapTypes(t *testing.T) {
	t.Parallel()

	type namedMap map[string]any

	got, err := browseURL(
		namedMap{
			"Query":  "monster",
			"Status": "airing",
			"SFW":    true,
		},
		map[string]any{
			"status": "complete",
		},
	)
	if err != nil {
		t.Fatalf("browseURL error: %v", err)
	}

	want := "/browse?q=monster&sfw=true&status=complete"
	if got != want {
		t.Fatalf("unexpected url\nwant: %s\ngot:  %s", want, got)
	}
}
