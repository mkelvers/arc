package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"

	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"

	_ "github.com/mattn/go-sqlite3"
)

type titleProviderStub struct {
	loads    int
	resolves int
}

func (p *titleProviderStub) Name() string { return "TVmaze" }

func (p *titleProviderStub) ResolveEpisodeProviderID(context.Context, int, []string) (string, error) {
	p.resolves++
	return "80712", nil
}

func (p *titleProviderStub) GetEpisodeTitlesByProviderID(context.Context, string, domain.Anime, int) (map[int]string, error) {
	p.loads++
	return map[int]string{1: "TVmaze title one", 2: "TVmaze title two"}, nil
}

func TestMergeMissingTitlesPreservesAllAnimeTitles(t *testing.T) {
	episodes := []domain.CanonicalEpisode{
		{Number: 1, Title: "AllAnime title"},
		{Number: 2, Title: "Episode 2"},
		{Number: 3, Title: "Episode 3"},
	}

	changed := mergeMissingTitles(episodes, map[int]string{
		1: "TVmaze title one",
		2: "TVmaze title two",
	})

	if !changed {
		t.Fatal("expected missing title to be enriched")
	}
	if episodes[0].Title != "AllAnime title" {
		t.Fatalf("AllAnime title was overwritten: %q", episodes[0].Title)
	}
	if episodes[1].Title != "TVmaze title two" {
		t.Fatalf("episode 2 title = %q", episodes[1].Title)
	}
	if episodes[2].Title != "Episode 3" {
		t.Fatalf("episode 3 title = %q", episodes[2].Title)
	}
}

func TestEnrichEpisodeTitlesCachesTVmazeTitles(t *testing.T) {
	ctx := context.Background()
	sqlDB := newTitleTestDB(ctx, t)
	provider := &titleProviderStub{}
	svc := &EpisodeService{queries: db.New(sqlDB), titles: provider, clock: realClock{}}
	anime := domain.Anime{Anime: jikan.Anime{
		MalID:        59846,
		Title:        "Saigo ni Hitotsu dake Onegai shitemo Yoroshii deshou ka",
		TitleEnglish: "May I Ask for One Final Thing?",
	}}

	for range 2 {
		assertEnrichedTitleList(t, svc, anime)
	}
	if provider.resolves != 1 || provider.loads != 1 {
		t.Fatalf("provider calls = resolves:%d loads:%d, want 1 each", provider.resolves, provider.loads)
	}
	assertCachedTitles(ctx, t, sqlDB)
}

func newTitleTestDB(ctx context.Context, t *testing.T) *sql.DB {
	t.Helper()
	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close sqlite: %v", err)
		}
	})
	sqlDB.SetMaxOpenConns(1)

	for _, statement := range []string{
		`CREATE TABLE episode_availability_cache (
			anime_id INTEGER PRIMARY KEY, data TEXT NOT NULL, next_refresh_at DATETIME,
			retry_until_at DATETIME, last_attempt_at DATETIME, last_success_at DATETIME,
			failure_count INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '',
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE episode_provider_mapping (
			anime_id INTEGER NOT NULL, provider TEXT NOT NULL, provider_show_id TEXT NOT NULL,
			failed_until DATETIME, last_error TEXT NOT NULL DEFAULT '',
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (anime_id, provider)
		)`,
		`INSERT INTO episode_availability_cache (
			anime_id, data, next_refresh_at, failure_count, last_error
		) VALUES (
			59846,
			'{"anime_id":59846,"source":"AllAnime","availability_version":4,"episodes":[{"number":1,"title":"AllAnime title","has_sub":true},{"number":2,"title":"Episode 2","has_sub":true}]}',
			'2999-01-01T00:00:00Z', 2, 'preserve me'
		)`,
	} {
		if _, err := sqlDB.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	return sqlDB
}

func assertEnrichedTitleList(t *testing.T, svc *EpisodeService, anime domain.Anime) {
	t.Helper()
	list, err := svc.EnrichEpisodeTitles(context.Background(), anime)
	if err != nil {
		t.Fatal(err)
	}
	if list.Episodes[0].Title != "AllAnime title" || list.Episodes[1].Title != "TVmaze title two" {
		t.Fatalf("episodes = %#v", list.Episodes)
	}
}

func assertCachedTitles(ctx context.Context, t *testing.T, sqlDB *sql.DB) {
	t.Helper()
	var raw, lastError string
	var failureCount int
	if err := sqlDB.QueryRowContext(ctx, `SELECT data, failure_count, last_error FROM episode_availability_cache WHERE anime_id = 59846`).Scan(&raw, &failureCount, &lastError); err != nil {
		t.Fatal(err)
	}
	var cached domain.CanonicalEpisodeList
	if err := json.Unmarshal([]byte(raw), &cached); err != nil {
		t.Fatal(err)
	}
	if cached.Episodes[1].Title != "TVmaze title two" || failureCount != 2 || lastError != "preserve me" {
		t.Fatalf("cached = %#v failure_count=%d last_error=%q", cached.Episodes, failureCount, lastError)
	}
}
