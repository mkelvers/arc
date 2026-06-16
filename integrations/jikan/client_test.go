package jikan

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"mal/internal/config"
	"mal/internal/db"
	"mal/internal/observability"
	"net/http"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestGetWithCacheReturnsStaleAndRefreshesAsync(t *testing.T) {
	sqlDB := newTestCacheDB(t)
	defer sqlDB.Close()

	queries := db.New(sqlDB)
	client := NewClient(config.Config{}, queries, observability.NewMetrics())
	stale := TopAnimeResponse{Data: []Anime{{MalID: 1, Title: "stale"}}}
	insertCachedResponse(t, sqlDB, "top:1", stale, time.Now().Add(-time.Hour))

	client.fetcher.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			body := `{"data":[{"mal_id":2,"title":"fresh"}]}`
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		}),
	}

	var got TopAnimeResponse
	if err := client.getWithCache(context.Background(), "top:1", time.Hour, "https://example.test/top", &got); err != nil {
		t.Fatalf("getWithCache: %v", err)
	}
	if len(got.Data) != 1 || got.Data[0].Title != "stale" {
		t.Fatalf("got %+v, want stale cache response", got.Data)
	}
	waitForFreshCache(t, sqlDB, client, "top:1")
}

func TestGetWithCacheAllowsEmptySearchResults(t *testing.T) {
	sqlDB := newTestCacheDB(t)
	defer sqlDB.Close()

	queries := db.New(sqlDB)
	client := NewClient(config.Config{}, queries, observability.NewMetrics())
	client.fetcher.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			body := `{"pagination":{"has_next_page":false},"data":[]}`
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		}),
	}

	var got SearchResponse
	if err := client.getWithCache(context.Background(), "search::::::12:0:true:1:24", time.Hour, "https://example.test/anime?genres=12", &got); err != nil {
		t.Fatalf("getWithCache() returned error for empty search response: %v", err)
	}
	if len(got.Data) != 0 {
		t.Fatalf("getWithCache() data length = %d, want 0", len(got.Data))
	}
}

func newTestCacheDB(t *testing.T) *sql.DB {
	t.Helper()
	ctx := context.Background()

	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	_, err = sqlDB.ExecContext(ctx, `
		CREATE TABLE jikan_cache (
			key TEXT PRIMARY KEY,
			data TEXT NOT NULL,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		sqlDB.Close()
		t.Fatalf("create cache table: %v", err)
	}

	return sqlDB
}

func insertCachedResponse(t *testing.T, sqlDB *sql.DB, key string, value TopAnimeResponse, expiresAt time.Time) {
	t.Helper()
	ctx := context.Background()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal cached response: %v", err)
	}

	_, err = sqlDB.ExecContext(
		ctx,
		`INSERT INTO jikan_cache (key, data, expires_at) VALUES (?, ?, ?)`,
		key,
		string(encoded),
		expiresAt,
	)
	if err != nil {
		t.Fatalf("insert cached response: %v", err)
	}
}

func waitForFreshCache(t *testing.T, sqlDB *sql.DB, client *Client, key string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		var refreshed TopAnimeResponse
		if client.getCache(context.Background(), key, &refreshed) && len(refreshed.Data) == 1 && refreshed.Data[0].Title == "fresh" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	var rawData string
	var rawExpires string
	_ = sqlDB.QueryRowContext(context.Background(), `SELECT data, expires_at FROM jikan_cache WHERE key = ?`, key).Scan(&rawData, &rawExpires)
	t.Fatalf("cache was not refreshed asynchronously; data=%s expires_at=%s", rawData, rawExpires)
}
