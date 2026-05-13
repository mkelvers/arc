package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

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

// GetDBFile returns the database file path, checking DATABASE_FILE env var first
func GetDBFile() string {
	if f := os.Getenv("DATABASE_FILE"); f != "" {
		return f
	}
	return "mal.db"
}

// GetMigrationsDir returns the migrations directory, checking MIGRATIONS_DIR env var first
func GetMigrationsDir() (string, error) {
	if dir := os.Getenv("MIGRATIONS_DIR"); dir != "" {
		return dir, nil
	}
	wd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("failed to get working directory: %w", err)
	}
	return filepath.Join(wd, "migrations"), nil
}

// Init opens the database and returns a Queries instance
func Init(db *sql.DB) (*Queries, error) {
	return New(db), nil
}
