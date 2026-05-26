package db

import (
	"database/sql"
	"fmt"

	// sqlite3 driver.
	_ "github.com/mattn/go-sqlite3"
)

// Open connects to a sqlite3 database with foreign keys enforced
func Open(dbFile string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on", dbFile))
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}
	return db, nil
}
