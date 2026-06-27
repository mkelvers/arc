package fixes

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestEpisodeAvailabilityBackfillSetsMissingNextRefreshAt(t *testing.T) {
	sqlDB := newFixTestDB(t)
	defer closeTestDB(t, sqlDB)

	ctx := context.Background()
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO episode_availability_cache (anime_id, data, next_refresh_at, updated_at) VALUES (1, '{}', NULL, '2000-01-01T00:00:00Z')`); err != nil {
		t.Fatalf("insert missing next_refresh row: %v", err)
	}
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO episode_availability_cache (anime_id, data, next_refresh_at, updated_at) VALUES (2, '{}', '2999-01-01T00:00:00Z', '2000-01-01T00:00:00Z')`); err != nil {
		t.Fatalf("insert populated next_refresh row: %v", err)
	}

	runFix(ctx, t, sqlDB, "20260526_episode_availability_backfill_next_refresh_at", Dependencies{})

	assertNextRefreshAtBackfilled(ctx, t, sqlDB, 1)
	assertUpdatedAtChanged(ctx, t, sqlDB, 1, "2000-01-01T00:00:00Z")
	assertNextRefreshAtEquals(ctx, t, sqlDB, 2, "2999-01-01T00:00:00Z")

	backfilledNextRefreshAt := queryNextRefreshAt(ctx, t, sqlDB, 1)

	runFix(ctx, t, sqlDB, "20260526_episode_availability_backfill_next_refresh_at", Dependencies{})
	assertNextRefreshAtEquals(ctx, t, sqlDB, 1, backfilledNextRefreshAt)
}

func TestAvatarURLBackfillUsesDefaultAvatarForBlankURLs(t *testing.T) {
	sqlDB := newFixTestDB(t)
	defer closeTestDB(t, sqlDB)

	ctx := context.Background()
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO user (id, username, password_hash, avatar_url) VALUES ('blank', 'alice', 'hash', '')`); err != nil {
		t.Fatalf("insert blank avatar user: %v", err)
	}
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO user (id, username, password_hash, avatar_url) VALUES ('existing', 'bob', 'hash', 'custom.png')`); err != nil {
		t.Fatalf("insert existing avatar user: %v", err)
	}

	deps := Dependencies{DefaultAvatarURL: func(username string) string { return "avatar/" + username + ".png" }}
	runFix(ctx, t, sqlDB, "20260528_backfill_avatar_url", deps)

	assertUserAvatarURL(ctx, t, sqlDB, "blank", "avatar/alice.png")
	assertUserAvatarURL(ctx, t, sqlDB, "existing", "custom.png")

	runFix(ctx, t, sqlDB, "20260528_backfill_avatar_url", deps)
	assertUserAvatarURL(ctx, t, sqlDB, "blank", "avatar/alice.png")
}

func TestListAnimeMissingDurationSecondsOnlyReturnsRowsWithNullDuration(t *testing.T) {
	sqlDB := newFixTestDB(t)
	defer closeTestDB(t, sqlDB)

	ctx := context.Background()
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO anime (id, title_original, image_url, duration_seconds) VALUES (1, 'Missing', 'missing.png', NULL)`); err != nil {
		t.Fatalf("insert missing duration anime: %v", err)
	}
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO anime (id, title_original, image_url, duration_seconds) VALUES (2, 'Present', 'present.png', 1440)`); err != nil {
		t.Fatalf("insert present duration anime: %v", err)
	}

	rows, err := listAnimeMissingDurationSeconds(ctx, sqlDB)
	if err != nil {
		t.Fatalf("listAnimeMissingDurationSeconds: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("missing duration rows = %v, want 1 row", rows)
	}
	if rows[0].id != 1 || rows[0].titleOriginal != "Missing" {
		t.Fatalf("missing duration row = %+v, want anime 1", rows[0])
	}
}

func runFix(ctx context.Context, t *testing.T, sqlDB *sql.DB, id string, deps Dependencies) {
	t.Helper()

	for _, fix := range All() {
		if fix.ID != id {
			continue
		}
		if err := fix.Apply(ctx, sqlDB, deps); err != nil {
			t.Fatalf("apply fix %s: %v", id, err)
		}
		return
	}
	t.Fatalf("fix %s not registered", id)
}

func queryNextRefreshAt(ctx context.Context, t *testing.T, sqlDB *sql.DB, animeID int64) string {
	t.Helper()

	var v sql.NullString
	if err := sqlDB.QueryRowContext(ctx, `SELECT next_refresh_at FROM episode_availability_cache WHERE anime_id = ?`, animeID).Scan(&v); err != nil {
		t.Fatalf("query next_refresh_at for %d: %v", animeID, err)
	}
	if !v.Valid || v.String == "" {
		t.Fatalf("next_refresh_at for %d = %q, valid=%v; want populated", animeID, v.String, v.Valid)
	}
	return v.String
}

func assertNextRefreshAtBackfilled(ctx context.Context, t *testing.T, sqlDB *sql.DB, animeID int64) {
	t.Helper()
	queryNextRefreshAt(ctx, t, sqlDB, animeID)
}

func assertUpdatedAtChanged(ctx context.Context, t *testing.T, sqlDB *sql.DB, animeID int64, original string) {
	t.Helper()

	var updatedAt string
	if err := sqlDB.QueryRowContext(ctx, `SELECT updated_at FROM episode_availability_cache WHERE anime_id = ?`, animeID).Scan(&updatedAt); err != nil {
		t.Fatalf("query updated_at for %d: %v", animeID, err)
	}
	if updatedAt == original {
		t.Fatalf("updated_at for %d = %q, expected change", animeID, updatedAt)
	}
}

func assertNextRefreshAtEquals(ctx context.Context, t *testing.T, sqlDB *sql.DB, animeID int64, want string) {
	t.Helper()

	var v sql.NullString
	if err := sqlDB.QueryRowContext(ctx, `SELECT next_refresh_at FROM episode_availability_cache WHERE anime_id = ?`, animeID).Scan(&v); err != nil {
		t.Fatalf("query next_refresh_at for %d: %v", animeID, err)
	}
	if !v.Valid {
		t.Fatalf("next_refresh_at for %d is NULL", animeID)
	}
	if v.String != want {
		t.Fatalf("next_refresh_at for %d = %q, want %q", animeID, v.String, want)
	}
}

func assertUserAvatarURL(ctx context.Context, t *testing.T, sqlDB *sql.DB, id string, want string) {
	t.Helper()

	var got string
	if err := sqlDB.QueryRowContext(ctx, `SELECT avatar_url FROM user WHERE id = ?`, id).Scan(&got); err != nil {
		t.Fatalf("query avatar_url for %s: %v", id, err)
	}
	if got != want {
		t.Fatalf("avatar_url for %s = %q, want %q", id, got, want)
	}
}

func newFixTestDB(t *testing.T) *sql.DB {
	t.Helper()

	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	ctx := context.Background()
	for _, statement := range []string{
		`CREATE TABLE user (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, avatar_url TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE anime (id INTEGER PRIMARY KEY, title_original TEXT NOT NULL, title_english TEXT, title_japanese TEXT, image_url TEXT NOT NULL, airing BOOLEAN, duration_seconds REAL)`,
		`CREATE TABLE episode_availability_cache (anime_id INTEGER PRIMARY KEY, data TEXT NOT NULL, next_refresh_at DATETIME, retry_until_at DATETIME, last_attempt_at DATETIME, last_success_at DATETIME, failure_count INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
	} {
		if _, err := sqlDB.ExecContext(ctx, statement); err != nil {
			closeTestDB(t, sqlDB)
			t.Fatalf("create test schema: %v", err)
		}
	}

	return sqlDB
}

func closeTestDB(t *testing.T, sqlDB *sql.DB) {
	t.Helper()

	if err := sqlDB.Close(); err != nil {
		t.Errorf("close sqlite: %v", err)
	}
}
