package templates

import (
	"html/template"
	"mal/internal/domain"
	"testing"
)

func TestDictEvenArgs(t *testing.T) {
	t.Parallel()

	got, err := dict("key1", "val1", "key2", 42)
	if err != nil {
		t.Fatalf("dict error: %v", err)
	}
	if got["key1"] != "val1" {
		t.Errorf("expected key1=val1, got %v", got["key1"])
	}
	if got["key2"] != 42 {
		t.Errorf("expected key2=42, got %v", got["key2"])
	}
}

func TestDictOddArgs(t *testing.T) {
	t.Parallel()

	_, err := dict("key1", "val1", "key2")
	if err == nil {
		t.Fatal("expected error for odd number of args")
	}
}

func TestDictNonStringKey(t *testing.T) {
	t.Parallel()

	_, err := dict(42, "val1")
	if err == nil {
		t.Fatal("expected error for non-string key")
	}
}

func TestJSONAttr(t *testing.T) {
	t.Parallel()

	v := map[string]int{"a": 1}
	got, err := jsonAttr(v)
	if err != nil {
		t.Fatalf("jsonAttr error: %v", err)
	}
	if _, ok := any(got).(template.HTMLAttr); ok {
		t.Fatal("jsonAttr returned trusted HTML attribute content")
	}
	if _, ok := any(got).(string); !ok {
		t.Fatalf("jsonAttr returned %T, want string", got)
	}
	want := `{"a":1}`
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestJSONAttrUnmarshalable(t *testing.T) {
	t.Parallel()

	_, err := jsonAttr(func() {})
	if err == nil {
		t.Fatal("expected error for unmarshalable value")
	}
}

func TestBrowseURLPreservesAndOverridesParams(t *testing.T) {
	t.Parallel()

	got, err := browseURL(
		map[string]any{
			"Query":   "full metal",
			"Type":    "tv",
			"Status":  "airing",
			"OrderBy": "score",
			"Sort":    "desc",
			"Studio":  42,
			"SFW":     true,
			"Genres":  []int{1, 2},
			"Page":    3,
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

func TestBrowseURLWithoutSFWStateOmitsParameter(t *testing.T) {
	t.Parallel()

	got, err := browseURL(
		map[string]any{
			"Query": "monster",
		},
		nil,
	)
	if err != nil {
		t.Fatalf("browseURL error: %v", err)
	}

	if got != "/browse?q=monster" {
		t.Fatalf("expected sfw to be omitted, got %s", got)
	}
}

func TestBrowseURLIncludesSFWTrue(t *testing.T) {
	t.Parallel()

	got, err := browseURL(
		map[string]any{
			"Query": "monster",
			"SFW":   true,
		},
		nil,
	)
	if err != nil {
		t.Fatalf("browseURL error: %v", err)
	}

	if got != "/browse?q=monster&sfw=true" {
		t.Fatalf("expected sfw=true, got %s", got)
	}
}

func TestBrowseURLSFWFalse(t *testing.T) {
	t.Parallel()

	got, err := browseURL(
		map[string]any{
			"Query": "monster",
			"SFW":   false,
		},
		nil,
	)
	if err != nil {
		t.Fatalf("browseURL error: %v", err)
	}

	if got != "/browse?q=monster&sfw=false" {
		t.Fatalf("expected sfw=false, got %s", got)
	}
}

func TestBrowseURLWithSFWOverride(t *testing.T) {
	t.Parallel()

	got, err := browseURL(
		map[string]any{
			"Query": "monster",
		},
		map[string]any{
			"sfw": true,
		},
	)
	if err != nil {
		t.Fatalf("browseURL error: %v", err)
	}

	if got != "/browse?q=monster&sfw=true" {
		t.Fatalf("unexpected url, got %s", got)
	}
}

func TestSeqPositive(t *testing.T) {
	t.Parallel()

	got := seq(5)
	want := []int{0, 1, 2, 3, 4}
	if len(got) != len(want) {
		t.Fatalf("expected length %d, got %d", len(want), len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("expected [%d]=%d, got %d", i, want[i], got[i])
		}
	}
}

func TestSeqZero(t *testing.T) {
	t.Parallel()

	got := seq(0)
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

func TestSeqNegative(t *testing.T) {
	t.Parallel()

	got := seq(-3)
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

func TestDivNormal(t *testing.T) {
	t.Parallel()

	got := div(10, 3)
	if got != 10.0/3.0 {
		t.Errorf("expected %f, got %f", 10.0/3.0, got)
	}
}

func TestDivByZero(t *testing.T) {
	t.Parallel()

	got := div(5, 0)
	if got != 0 {
		t.Errorf("expected 0, got %f", got)
	}
}

func TestCeilDivNormal(t *testing.T) {
	t.Parallel()

	got := ceilDiv(10, 3)
	if got != 4 {
		t.Errorf("expected 4, got %d", got)
	}
}

func TestCeilDivExact(t *testing.T) {
	t.Parallel()

	got := ceilDiv(9, 3)
	if got != 3 {
		t.Errorf("expected 3, got %d", got)
	}
}

func TestCeilDivByZero(t *testing.T) {
	t.Parallel()

	got := ceilDiv(5, 0)
	if got != 0 {
		t.Errorf("expected 0, got %d", got)
	}
}

func TestIDivNormal(t *testing.T) {
	t.Parallel()

	got := idiv(10, 3)
	if got != 3 {
		t.Errorf("expected 3, got %d", got)
	}
}

func TestIDivByZero(t *testing.T) {
	t.Parallel()

	got := idiv(5, 0)
	if got != 0 {
		t.Errorf("expected 0, got %d", got)
	}
}

func TestAtoiString(t *testing.T) {
	t.Parallel()

	got := atoi("42")
	if got != 42 {
		t.Errorf("expected 42, got %d", got)
	}
}

func TestAtoiInvalid(t *testing.T) {
	t.Parallel()

	got := atoi("not-a-number")
	if got != 0 {
		t.Errorf("expected 0, got %d", got)
	}
}

func TestAtoiNonString(t *testing.T) {
	t.Parallel()

	got := atoi(42)
	if got != 0 {
		t.Errorf("expected 0, got %d", got)
	}
}

func TestToIntFromInt(t *testing.T) {
	t.Parallel()

	got := toInt(42)
	if got != 42 {
		t.Errorf("expected 42, got %d", got)
	}
}

func TestToIntFromString(t *testing.T) {
	t.Parallel()

	got := toInt("42")
	if got != 42 {
		t.Errorf("expected 42, got %d", got)
	}
}

func TestToIntFromInvalidString(t *testing.T) {
	t.Parallel()

	got := toInt("bad")
	if got != 0 {
		t.Errorf("expected 0, got %d", got)
	}
}

func TestToIntFromFloat(t *testing.T) {
	t.Parallel()

	got := toInt(3.14)
	if got != 3 {
		t.Errorf("expected 3, got %d", got)
	}
}

func TestPercentNormal(t *testing.T) {
	t.Parallel()

	got := percent(25, 100)
	if got != 25 {
		t.Errorf("expected 25, got %f", got)
	}
}

func TestPercentZeroTotal(t *testing.T) {
	t.Parallel()

	got := percent(25, 0)
	if got != 0 {
		t.Errorf("expected 0, got %f", got)
	}
}

func TestFormatDateRFC3339(t *testing.T) {
	t.Parallel()

	got := formatDate("2024-01-15T10:30:00Z")
	want := "Jan 15, 2024"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestFormatDateAltFormat(t *testing.T) {
	t.Parallel()

	got := formatDate("2024-01-15T10:30:00+00:00")
	want := "Jan 15, 2024"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestFormatDateInvalid(t *testing.T) {
	t.Parallel()

	got := formatDate("not-a-date")
	if got != "not-a-date" {
		t.Errorf("expected input string back, got %q", got)
	}
}

func TestNextSortAsc(t *testing.T) {
	t.Parallel()

	got := nextSort("asc")
	if got != "desc" {
		t.Errorf("expected desc, got %s", got)
	}
}

func TestNextSortDesc(t *testing.T) {
	t.Parallel()

	got := nextSort("desc")
	if got != "asc" {
		t.Errorf("expected asc, got %s", got)
	}
}

func TestNextSortDefault(t *testing.T) {
	t.Parallel()

	got := nextSort("")
	if got != "asc" {
		t.Errorf("expected asc, got %s", got)
	}
}

func TestSortDirectionLabel(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		orderBy string
		sort    string
		want    string
	}{
		{name: "popularity desc", orderBy: "popularity", sort: "desc", want: "Most popular"},
		{name: "popularity asc", orderBy: "popularity", sort: "asc", want: "Least popular"},
		{name: "score desc", orderBy: "score", sort: "desc", want: "Highest score"},
		{name: "score asc", orderBy: "score", sort: "asc", want: "Lowest score"},
		{name: "default desc", orderBy: "", sort: "", want: "Most popular"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := sortDirectionLabel(tt.orderBy, tt.sort)
			if got != tt.want {
				t.Errorf("sortDirectionLabel(%q, %q) = %q, want %q", tt.orderBy, tt.sort, got, tt.want)
			}
		})
	}
}

func TestNextSortDirectionLabel(t *testing.T) {
	t.Parallel()

	got := nextSortDirectionLabel("score", "desc")
	if got != "Lowest score" {
		t.Errorf("expected Lowest score, got %q", got)
	}
}

func TestGenresParams(t *testing.T) {
	t.Parallel()

	got := genresParams([]int{1, 2, 3})
	want := "genres=1&genres=2&genres=3"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestGenresParamsEmpty(t *testing.T) {
	t.Parallel()

	got := genresParams(nil)
	if got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}

func TestOrderedGenreOptionsSelectedFirst(t *testing.T) {
	t.Parallel()

	got := orderedGenreOptions(
		[]domain.Genre{
			{MalID: 1, Name: "Action"},
			{MalID: 2, Name: "Comedy"},
			{MalID: 3, Name: "Shounen"},
			{MalID: 4, Name: "Drama"},
		},
		[]int{3, 1},
	)

	wantIDs := []int{1, 3, 2, 4}
	if len(got) != len(wantIDs) {
		t.Fatalf("expected %d genres, got %d", len(wantIDs), len(got))
	}
	for i, wantID := range wantIDs {
		if got[i].Genre.MalID != wantID {
			t.Fatalf("genre at index %d = %d, want %d", i, got[i].Genre.MalID, wantID)
		}
	}
	if !got[0].Selected || !got[1].Selected {
		t.Fatalf("expected first two genres to be selected, got %+v", got[:2])
	}
	if !got[2].StartsInactive {
		t.Fatalf("expected first inactive genre to start divider, got %+v", got[2])
	}
	if got[3].StartsInactive {
		t.Fatalf("expected divider only on first inactive genre, got %+v", got[3])
	}
}

func TestOrderedGenreOptionsNoSelectedGenresPreservesOrder(t *testing.T) {
	t.Parallel()

	got := orderedGenreOptions(
		[]domain.Genre{
			{MalID: 1, Name: "Action"},
			{MalID: 2, Name: "Comedy"},
		},
		nil,
	)

	for i, option := range got {
		if option.Selected {
			t.Fatalf("expected genre at index %d to be inactive", i)
		}
		if option.StartsInactive {
			t.Fatalf("expected no inactive divider without active genres")
		}
		if option.Genre.MalID != i+1 {
			t.Fatalf("genre at index %d = %d, want %d", i, option.Genre.MalID, i+1)
		}
	}
}

func TestPosterURLWebp(t *testing.T) {
	t.Parallel()

	got := posterURL("https://example.com/webp", "https://example.com/jpg", 400, 600)
	want := "https://example.com/webp"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestCapitalize(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"MAIN":       "Main",
		"SUPPORTING": "Supporting",
		"":           "",
	}
	for input, want := range tests {
		if got := capitalize(input); got != want {
			t.Errorf("capitalize(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestPosterURLJpgFallback(t *testing.T) {
	t.Parallel()

	got := posterURL(nil, "https://example.com/jpg", 400, 600)
	want := "https://example.com/jpg"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestPosterURLPlaceholder(t *testing.T) {
	t.Parallel()

	got := posterURL(nil, nil, 400, 600)
	want := "https://placehold.co/400x600?text=No+Image"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestPosterURLEmptyWebp(t *testing.T) {
	t.Parallel()

	got := posterURL("", "", 200, 300)
	want := "https://placehold.co/200x300?text=No+Image"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestEpisodeRangeStart(t *testing.T) {
	t.Parallel()

	tests := []struct {
		epNum, step, want int
	}{
		{1, 100, 1},
		{50, 100, 1},
		{100, 100, 1},
		{101, 100, 101},
		{156, 100, 101},
		{200, 100, 101},
		{201, 100, 201},
	}
	for _, tc := range tests {
		got := episodeRangeStart(tc.epNum, tc.step)
		if got != tc.want {
			t.Errorf("episodeRangeStart(%d, %d) = %d, want %d", tc.epNum, tc.step, got, tc.want)
		}
	}
}

func TestEpisodeRangeStartZero(t *testing.T) {
	t.Parallel()

	got := episodeRangeStart(0, 100)
	if got != 1 {
		t.Errorf("expected 1, got %d", got)
	}
}
