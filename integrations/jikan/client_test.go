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
	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer sqlDB.Close()
	sqlDB.SetMaxOpenConns(1)

	_, err = sqlDB.Exec(`
		CREATE TABLE jikan_cache (
			key TEXT PRIMARY KEY,
			data TEXT NOT NULL,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("create cache table: %v", err)
	}

	queries := db.New(sqlDB)
	client := NewClient(config.Config{}, queries, observability.NewMetrics())
	stale := TopAnimeResponse{Data: []Anime{{MalID: 1, Title: "stale"}}}
	staleBytes, err := json.Marshal(stale)
	if err != nil {
		t.Fatalf("marshal stale response: %v", err)
	}

	_, err = sqlDB.Exec(
		`INSERT INTO jikan_cache (key, data, expires_at) VALUES (?, ?, ?)`,
		"top:1",
		string(staleBytes),
		time.Now().Add(-time.Hour),
	)
	if err != nil {
		t.Fatalf("insert stale cache: %v", err)
	}

	client.httpClient = &http.Client{
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

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		var refreshed TopAnimeResponse
		if client.getCache(context.Background(), "top:1", &refreshed) && len(refreshed.Data) == 1 && refreshed.Data[0].Title == "fresh" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	var rawData string
	var rawExpires string
	_ = sqlDB.QueryRow(`SELECT data, expires_at FROM jikan_cache WHERE key = ?`, "top:1").Scan(&rawData, &rawExpires)
	t.Fatalf("cache was not refreshed asynchronously; data=%s expires_at=%s", rawData, rawExpires)
}
