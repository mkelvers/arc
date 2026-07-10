// Package database manages database schema migrations and fixes.
package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"mal/internal/config"
	"mal/internal/database/db"
	dbfixes "mal/internal/database/fixes"

	"github.com/pressly/goose/v3"
	"go.uber.org/fx"
)

//go:embed migrations/*.sql postgres_migrations/*.sql postgres_schema.sql
var migrationsFS embed.FS

var Module = fx.Options(
	fx.Provide(
		ProvideSQLDB,
		ProvideQueries,
	),
)

func ProvideSQLDB(cfg config.Config) (*sql.DB, error) {
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL must be configured for the application database")
	}
	dbConn, err := db.OpenPostgres(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open PostgreSQL database: %w", err)
	}
	return dbConn, nil
}

func ProvideQueries(sqlDB *sql.DB) *db.Queries {
	return db.New(sqlDB)
}

// RunPostgresMigrations applies the durable PostgreSQL schema used by the application.
func RunPostgresMigrations(sqlDB *sql.DB) error {
	schema, err := migrationsFS.ReadFile("postgres_schema.sql")
	if err != nil {
		return fmt.Errorf("read PostgreSQL schema: %w", err)
	}
	if _, err := sqlDB.ExecContext(context.Background(), string(schema)); err != nil {
		return fmt.Errorf("apply PostgreSQL schema: %w", err)
	}

	goose.SetBaseFS(migrationsFS)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set PostgreSQL migration dialect: %w", err)
	}
	if err := goose.Up(sqlDB, "postgres_migrations"); err != nil {
		return fmt.Errorf("apply PostgreSQL migrations: %w", err)
	}
	return nil
}

func RunPostgresMigrationsAndFixes(sqlDB *sql.DB, deps dbfixes.Dependencies) error {
	if err := RunPostgresMigrations(sqlDB); err != nil {
		return fmt.Errorf("run PostgreSQL migrations: %w", err)
	}
	if err := RunDataFixes(sqlDB, deps); err != nil {
		return fmt.Errorf("run PostgreSQL data fixes: %w", err)
	}
	return nil
}
