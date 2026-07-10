package templates

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"mal/integrations/metadata"
	"mal/internal/database/db"
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

func TestRenderUsesPurposeSizedBrandAssets(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("index.gohtml", map[string]any{
		"User":        true,
		"CurrentPath": "/",
	})
	w := httptest.NewRecorder()
	if err := render.Render(w); err != nil {
		t.Fatalf("Render error: %v", err)
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(w.Body.String()))
	if err != nil {
		t.Fatalf("parse rendered html: %v", err)
	}

	assertBrandAssetLinks(t, doc)
	assertNavigationLogo(t, doc)
}

func assertBrandAssetLinks(t *testing.T, doc *goquery.Document) {
	assets := map[string]string{
		`link[rel="manifest"]`:                          "/static/assets/manifest.json",
		`link[rel="icon"][sizes="32x32"]`:               "/static/assets/favicon-32.png",
		`link[rel="icon"][sizes="16x16"]`:               "/static/assets/favicon-16.png",
		`link[rel="apple-touch-icon"][sizes="180x180"]`: "/static/assets/apple-touch-icon-180.png",
	}
	for selector, want := range assets {
		got, ok := doc.Find(selector).Attr("href")
		if !ok {
			t.Fatalf("missing %s", selector)
		}
		path, _, _ := strings.Cut(got, "?")
		if path != want {
			t.Fatalf("%s href = %q, want %q", selector, path, want)
		}
	}
}

func assertNavigationLogo(t *testing.T, doc *goquery.Document) {
	logo := doc.Find(`a[title="Home"] img`)
	if logo.Length() != 1 {
		t.Fatalf("navigation logo count = %d, want 1", logo.Length())
	}
	src, _ := logo.Attr("src")
	src, _, _ = strings.Cut(src, "?")
	if src != "/static/assets/logo-128.png" {
		t.Fatalf("navigation logo src = %q", src)
	}
	if width, _ := logo.Attr("width"); width != "166" {
		t.Fatalf("navigation logo width = %q, want 166", width)
	}
	if height, _ := logo.Attr("height"); height != "128" {
		t.Fatalf("navigation logo height = %q, want 128", height)
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

func TestAnimeCharactersUsesCharacterWebpImage(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var entry domain.CharacterEntry
	entry.Character.Name = "Arc"
	entry.Character.Images.Webp.ImageURL = "https://example.com/arc.webp"
	entry.Character.Images.Jpg.ImageURL = ""

	body := renderTemplateFragment(t, r, "anime.gohtml", "anime_characters", map[string]any{
		"Items": []domain.CharacterEntry{entry},
	})
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(body))
	if err != nil {
		t.Fatalf("parse rendered html: %v", err)
	}

	src, ok := doc.Find(`img[alt="Arc"]`).Attr("src")
	if !ok || src != "https://example.com/arc.webp" {
		t.Fatalf("character image src = %q, want %q", src, "https://example.com/arc.webp")
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
				Anime: metadata.Anime{
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

type fragmentPollWant struct {
	text   string
	absent string
	poll   bool
	noPoll bool
}

type topPicksContentCase struct {
	name string
	data map[string]any
	want fragmentPollWant
}

type topPickSectionCase struct {
	name string
	data domain.CatalogSectionData
	want fragmentPollWant
}

func topPicksContentCases() []topPicksContentCase {
	return []topPicksContentCase{
		{"refreshing", topPicksContentData(domain.RecommendationStateRefreshing), fragmentPollWant{text: "skeleton", absent: "Preparing recommendations...", poll: true}},
		{"ready", topPicksContentData(domain.RecommendationStateReady, rendererTestAnime()), fragmentPollWant{text: "Haikyuu!!", noPoll: true}},
		{"stale", topPicksContentData(domain.RecommendationStateStale, rendererTestAnime()), fragmentPollWant{text: "Updating...", noPoll: true}},
		{"empty", topPicksContentData(domain.RecommendationStateEmpty), fragmentPollWant{text: "No top picks yet", noPoll: true}},
		{"failed", topPicksContentData(domain.RecommendationStateFailed), fragmentPollWant{text: "Recommendations could not be prepared.", noPoll: true}},
	}
}

func topPicksContentData(state domain.RecommendationRefreshState, animes ...domain.Anime) map[string]any {
	return map[string]any{
		"RecommendationState": state,
		"Animes":              animes,
		"WatchlistMap":        map[int64]bool{},
	}
}

func topPickSectionCases() []topPickSectionCase {
	return []topPickSectionCase{
		{"refreshing", topPickSectionData(domain.RecommendationStateRefreshing), fragmentPollWant{text: "skeleton", absent: "Preparing recommendations...", poll: true}},
		{"ready", topPickSectionData(domain.RecommendationStateReady, rendererTestAnime()), fragmentPollWant{text: "View all", noPoll: true}},
		{"failed", topPickSectionData(domain.RecommendationStateFailed), fragmentPollWant{text: "Recommendations could not be prepared.", noPoll: true}},
	}
}

func topPickSectionData(state domain.RecommendationRefreshState, animes ...domain.Anime) domain.CatalogSectionData {
	return domain.CatalogSectionData{
		RecommendationState: state,
		Animes:              animes,
		WatchlistMap:        map[int64]bool{},
	}
}

func rendererTestAnime() domain.Anime {
	return domain.Anime{Anime: metadata.Anime{MalID: 1, Title: "Haikyuu!!"}}
}

func renderTemplateFragment(t *testing.T, r *Renderer, name string, block string, data any) string {
	t.Helper()

	var buf bytes.Buffer
	if err := r.ExecuteFragment(&buf, name, block, data); err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}
	return buf.String()
}

func assertFragmentPollState(t *testing.T, label string, body string, want fragmentPollWant) {
	t.Helper()

	if !strings.Contains(body, want.text) {
		t.Fatalf("%s should contain %q:\n%s", label, want.text, body)
	}
	if want.absent != "" {
		assertFragmentMissing(t, label, body, want.absent)
	}

	hasPoll := strings.Contains(body, `hx-trigger="every 2s"`)
	if want.poll {
		assertFragmentPolls(t, label, body, hasPoll)
	}
	if want.noPoll {
		assertFragmentDoesNotPoll(t, label, body, hasPoll)
	}
}

func assertFragmentMissing(t *testing.T, label string, body string, text string) {
	t.Helper()

	if strings.Contains(body, text) {
		t.Fatalf("%s should not contain %q:\n%s", label, text, body)
	}
}

func assertFragmentPolls(t *testing.T, label string, body string, hasPoll bool) {
	t.Helper()

	if !hasPoll {
		t.Fatalf("%s should poll while refreshing:\n%s", label, body)
	}
}

func assertFragmentDoesNotPoll(t *testing.T, label string, body string, hasPoll bool) {
	t.Helper()

	if hasPoll {
		t.Fatalf("%s should not poll in terminal state:\n%s", label, body)
	}
}

func TestTopPicksContentPollsOnlyWhileRefreshing(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	for _, tt := range topPicksContentCases() {
		t.Run(tt.name, func(t *testing.T) {
			body := renderTemplateFragment(t, r, "top_picks.gohtml", "top_picks_content", tt.data)
			assertFragmentPollState(t, "top picks content", body, tt.want)
		})
	}
}

func TestHomeTopPickFragmentPollsOnlyWhileRefreshing(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	for _, tt := range topPickSectionCases() {
		t.Run(tt.name, func(t *testing.T) {
			body := renderTemplateFragment(t, r, "index.gohtml", "top_pick_for_you_section", tt.data)
			assertFragmentPollState(t, "home top pick fragment", body, tt.want)
		})
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
		Anime:       domain.Anime{Anime: metadata.Anime{MalID: 123, Title: "Example Anime"}},
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
	assertPlayerAccessibility(t, player)
}

func assertPlayerAccessibility(t *testing.T, player *goquery.Selection) {
	t.Helper()
	for selector, want := range map[string]string{
		"[data-play-pause]": "Play",
		"[data-mute]":       "Mute",
		"[data-fullscreen]": "Enter fullscreen",
		"[data-backward]":   "Seek backward 10 seconds",
		"[data-forward]":    "Seek forward 10 seconds",
	} {
		if accessibleName, _ := player.Find(selector).Attr("aria-label"); accessibleName != want {
			t.Fatalf("%s aria-label = %q, want %q", selector, accessibleName, want)
		}
	}
	if got := player.Find(`[data-loading-context], [data-loading-message]`).Length(); got != 0 {
		t.Fatalf("player loading copy count = %d, want 0", got)
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

func TestContinueWatchingTemplateUsesBannerWhenAvailable(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "index.gohtml", "continue_watching", []db.GetContinueWatchingEntriesRow{{
		AnimeID:        321,
		TitleOriginal:  "Original Title",
		ImageUrl:       "https://example.com/poster.webp",
		BannerImageUrl: "https://example.com/banner.webp",
	}})
	if err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}

	body := buf.String()
	if !strings.Contains(body, `src="https://example.com/banner.webp"`) {
		t.Fatalf("continue watching card should use the banner:\n%s", body)
	}
	if strings.Contains(body, `src="https://example.com/poster.webp"`) {
		t.Fatalf("continue watching card should not render the poster when a banner exists:\n%s", body)
	}
}

func TestContinueWatchingTemplateUsesLayeredPosterFallback(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "index.gohtml", "continue_watching", []db.GetContinueWatchingEntriesRow{{
		AnimeID:       321,
		TitleOriginal: "Original Title",
		ImageUrl:      "https://example.com/poster.webp",
	}})
	if err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}

	body := buf.String()
	if strings.Count(body, `src="https://example.com/poster.webp"`) != 2 {
		t.Fatalf("continue watching fallback should render blurred and sharp poster layers:\n%s", body)
	}
	if !strings.Contains(body, "blur-xl brightness-50") || !strings.Contains(body, "aspect-2/3") {
		t.Fatalf("continue watching fallback should blur the background and center the portrait:\n%s", body)
	}
}
