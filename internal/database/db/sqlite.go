package db

import (
	"context"
	"database/sql"
	"fmt"

	// sqlite3 driver.
	_ "github.com/mattn/go-sqlite3"
)

// Open connects to a sqlite3 database with foreign keys enforced
func Open(dbFile string) (*sql.DB, error) {
	// busy_timeout avoids immediate SQLITE_BUSY errors under concurrent access.
	// foreign_keys ensures FK constraints are enforced for this connection.
	// txlock=immediate acquires SQLite's write lock when a transaction starts,
	// which avoids deferred read->write lock upgrades failing mid-transaction.
	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on&_busy_timeout=5000&_txlock=immediate", dbFile))
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	// WAL improves concurrency between readers and writers.
	if _, err := db.ExecContext(context.Background(), "PRAGMA journal_mode=WAL;"); err != nil {
		return nil, fmt.Errorf("failed to enable WAL mode: %w", err)
	}
	if _, err := db.ExecContext(context.Background(), "PRAGMA busy_timeout=5000;"); err != nil {
		return nil, fmt.Errorf("failed to set busy timeout: %w", err)
	}
	return db, nil
}
