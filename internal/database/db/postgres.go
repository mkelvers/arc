package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// OpenPostgres opens and verifies the PostgreSQL application database.
// Schema migration is intentionally kept outside this helper so callers can
// choose the PostgreSQL migration path without changing test databases.
func OpenPostgres(databaseURL string) (*sql.DB, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("database URL is empty")
	}
	db, err := sql.Open("pgx-question", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxIdleTime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return db, nil
}
