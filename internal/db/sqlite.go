package db

import (
	"database/sql"
	"fmt"

	// sqlite3 driver.
	_ "github.com/mattn/go-sqlite3"
)

// Open connects to a sqlite3 database with foreign keys enforced
func Open(dbFile string) (*sql.DB, error) {
	// busy_timeout avoids immediate SQLITE_BUSY errors under concurrent access.
	// foreign_keys ensures FK constraints are enforced for this connection.
	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on&_busy_timeout=5000", dbFile))
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}
	// WAL improves concurrency between readers and writers.
	_, _ = db.Exec("PRAGMA journal_mode=WAL;")
	_, _ = db.Exec("PRAGMA busy_timeout=5000;")
	return db, nil
}
