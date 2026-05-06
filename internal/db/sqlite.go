package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

func Open(dbFile string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on", dbFile))
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}
	return db, nil
}

func GetDBFile() string {
	if f := os.Getenv("DATABASE_FILE"); f != "" {
		return f
	}
	return "mal.db"
}

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

func Init(db *sql.DB) (*Queries, error) {
	migrationsDir, err := GetMigrationsDir()
	if err != nil {
		return nil, err
	}
	if err := RunMigrations(db, migrationsDir); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}
	return New(db), nil
}
