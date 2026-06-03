package db

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestHasSkipSegmentOverrideTableReturnsFalseWhenMissing(t *testing.T) {
	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()

	ok, err := New(sqlDB).HasSkipSegmentOverrideTable(context.Background())
	if err != nil {
		t.Fatalf("HasSkipSegmentOverrideTable: %v", err)
	}
	if ok {
		t.Fatalf("HasSkipSegmentOverrideTable returned true for missing table")
	}
}
