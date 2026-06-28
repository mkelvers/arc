package templates

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func TestProvideRendererParsesTemplates(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatalf("parse templates: %v", err)
	}
	if len(r.templates) == 0 {
		t.Fatal("expected at least one parsed template")
	}
}

func TestInstanceReturnsHTMLRender(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("index.gohtml", map[string]any{"key": "val"})
	hr, ok := render.(HTMLRender)
	if !ok {
		t.Fatalf("expected HTMLRender, got %T", render)
	}
	if hr.Name != "index.gohtml" {
		t.Errorf("expected index.gohtml, got %s", hr.Name)
	}
}

func TestRenderValidTemplate(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("index.gohtml", map[string]any{
		"User": false,
	})
	w := httptest.NewRecorder()
	if err := render.Render(w); err != nil {
		t.Fatalf("Render error: %v", err)
	}
	if !strings.Contains(w.Body.String(), "<!DOCTYPE html>") {
		t.Error("expected HTML doctype in output")
	}
}

func TestRenderInvalidTemplate(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("nonexistent.gohtml", nil)
	w := httptest.NewRecorder()
	if err := render.Render(w); err == nil {
		t.Fatal("expected error for nonexistent template")
	}
}

func TestRenderWithFragment(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("index.gohtml", map[string]any{
		"_fragment": "content",
		"User":      false,
	})
	w := httptest.NewRecorder()
	if err := render.Render(w); err != nil {
		t.Fatalf("Render error: %v", err)
	}
	if !strings.Contains(w.Body.String(), "Airing & Popular") {
		t.Error("expected content block in fragment render")
	}
}

func TestRenderWithNonStringFragment(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("index.gohtml", map[string]any{
		"_fragment": 42,
	})
	w := httptest.NewRecorder()
	if err := render.Render(w); err != nil {
		t.Fatalf("Render error: %v", err)
	}
	// non-string fragment should fall through to default template rendering
	if !strings.Contains(w.Body.String(), "<!DOCTYPE html>") {
		t.Error("expected HTML output for non-string fragment fallthrough")
	}
}

func TestTopPicksTemplateDoesNotRenderRecommendationRationale(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "top_picks.gohtml", "content", map[string]any{
		"Animes": []domain.Anime{
			{
				Anime: jikan.Anime{
					MalID: 1,
					Title: "Haikyuu!!",
				},
				RecommendationRationale: []string{"Sports", "Production I.G"},
			},
		},
		"WatchlistMap": map[int64]bool{},
	})
	if err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}

	body := buf.String()
	for _, want := range []string{"Why this was picked", "Sports", "Production I.G"} {
		if strings.Contains(body, want) {
			t.Fatalf("top picks template should not render %q:\n%s", want, body)
		}
	}
}

func TestTopPicksTemplateStylesBackToHomeAsButton(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "top_picks.gohtml", "content", map[string]any{
		"Animes":       []domain.Anime{},
		"WatchlistMap": map[int64]bool{},
	})
	if err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}

	body := buf.String()
	want := `href="/" class="inline-flex h-10 items-center justify-center bg-background-button px-4 text-sm font-normal text-foreground transition-colors hover:bg-background-button-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"`
	if !strings.Contains(body, want) {
		t.Fatalf("top picks back link should use button styling:\n%s", body)
	}
}

func TestAnimeEpisodeCountTemplateDoesNotRenderAvailabilityStatus(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "anime.gohtml", "anime_episode_count", map[string]any{
		"Items": map[string]any{
			"Count":      3,
			"Label":      "Available episodes",
			"Status":     "Retrying soon",
			"StatusTone": "warning",
		},
	})
	if err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}
	body := buf.String()
	if strings.Contains(body, "Retrying soon") || strings.Contains(body, "data-episode-availability-status") {
		t.Fatalf("anime episode count should not expose availability status:\n%s", body)
	}
}

func TestWatchTemplateEscapesJSONDataAttributes(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	label := `English ' data-injected='yes' <b>&"`
	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "watch.gohtml", "content", domain.WatchPageData{
		Anime:       domain.Anime{Anime: jikan.Anime{MalID: 123, Title: "Example Anime"}},
		CurrentEpID: "1",
		Episodes: []domain.CanonicalEpisode{
			{Number: 1, Title: "Episode 1", HasSub: true},
		},
		WatchData: domain.WatchData{
			MalID:          123,
			Title:          "Example Anime",
			CurrentEpisode: "1",
			ModeSources: map[string]domain.ModeSource{
				"sub": {
					Token: "stream-token",
					Subtitles: []domain.SubtitleItem{
						{Lang: label, Token: "subtitle-token"},
					},
				},
			},
			AvailableModes: []string{"sub"},
		},
	})
	if err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(buf.String()))
	if err != nil {
		t.Fatalf("parse rendered html: %v", err)
	}
	player := doc.Find("[data-video-player]")
	if got := player.Length(); got != 1 {
		t.Fatalf("data-video-player count = %d, want 1", got)
	}
	if injected, ok := player.Attr("data-injected"); ok {
		t.Fatalf("json data created injected attribute %q in html:\n%s", injected, buf.String())
	}
	if got := player.Find("b").Length(); got != 0 {
		t.Fatalf("json data created %d nested b tags in html:\n%s", got, buf.String())
	}

	raw, ok := player.Attr("data-mode-sources")
	if !ok {
		t.Fatalf("missing data-mode-sources in html:\n%s", buf.String())
	}
	var sources map[string]domain.ModeSource
	if err := json.Unmarshal([]byte(raw), &sources); err != nil {
		t.Fatalf("data-mode-sources is not recoverable json: %v\nraw: %s", err, raw)
	}
	got := sources["sub"].Subtitles[0].Lang
	if got != label {
		t.Fatalf("subtitle label mismatch\nwant: %q\ngot:  %q", label, got)
	}
}

func TestExecuteFragmentValid(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "index.gohtml", "content", map[string]any{
		"User": false,
	})
	if err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}
	if !strings.Contains(buf.String(), "Airing & Popular") {
		t.Error("expected content in fragment output")
	}
}

func TestExecuteFragmentInvalidTemplate(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "missing.gohtml", "content", nil)
	if err == nil {
		t.Fatal("expected error for missing template")
	}
}

func TestContinueWatchingTemplateIncludesAnimeDetailsLink(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "index.gohtml", "continue_watching", []db.GetContinueWatchingEntriesRow{
		{
			AnimeID:        321,
			TitleOriginal:  "Original Title",
			TitleEnglish:   sql.NullString{String: "English Title", Valid: true},
			ImageUrl:       "https://example.com/poster.webp",
			CurrentEpisode: sql.NullInt64{Int64: 7, Valid: true},
		},
	})
	if err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}

	body := buf.String()
	if !strings.Contains(body, `href="/anime/321"`) {
		t.Fatalf("continue watching card should include anime details link:\n%s", body)
	}
	if !strings.Contains(body, `href="/anime/321/watch?ep=7"`) {
		t.Fatalf("continue watching card should keep watch link:\n%s", body)
	}
}
