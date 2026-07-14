// Package database manages PostgreSQL schema setup and data fixes.
package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"mal/internal/database/db"
	dbfixes "mal/internal/database/fixes"

	"go.uber.org/fx"
)

//go:embed postgres_schema.sql
var schemaFS embed.FS

type Config struct {
	URL string
}

var Module = fx.Options(
	fx.Provide(
		ProvideSQLDB,
		ProvideQueries,
	),
)

func ProvideSQLDB(cfg Config) (*sql.DB, error) {
	if cfg.URL == "" {
		return nil, fmt.Errorf("DATABASE_URL must be configured for the application database")
	}
	dbConn, err := db.OpenPostgres(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to open PostgreSQL database: %w", err)
	}
	return dbConn, nil
}

func ProvideQueries(sqlDB *sql.DB) *db.Queries {
	return db.New(sqlDB)
}

func ApplyPostgresSchema(sqlDB *sql.DB) error {
	schema, err := schemaFS.ReadFile("postgres_schema.sql")
	if err != nil {
		return fmt.Errorf("read PostgreSQL schema: %w", err)
	}
	if _, err := sqlDB.ExecContext(context.Background(), string(schema)); err != nil {
		return fmt.Errorf("apply PostgreSQL schema: %w", err)
	}
	return nil
}

func ApplyPostgresSchemaAndFixes(sqlDB *sql.DB, deps dbfixes.Dependencies) error {
	if err := ApplyPostgresSchema(sqlDB); err != nil {
		return fmt.Errorf("apply PostgreSQL schema: %w", err)
	}
	if err := RunDataFixes(sqlDB, deps); err != nil {
		return fmt.Errorf("run PostgreSQL data fixes: %w", err)
	}
	return nil
}
