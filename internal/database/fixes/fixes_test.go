package fixes

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

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
