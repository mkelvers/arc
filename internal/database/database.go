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
	"mal/internal/observability"

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

func RunMigrations(sqlDB *sql.DB) error {
	goose.SetBaseFS(migrationsFS)
	goose.SetLogger(goose.NopLogger())

	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("failed to set goose dialect: %w", err)
	}

	observability.Info("db_migrations_start", "database", "", nil)
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	version, err := goose.GetDBVersion(sqlDB)
	if err != nil {
		return fmt.Errorf("failed to get database migration version: %w", err)
	}

	observability.Info("db_migrations_complete", "database", "", map[string]any{"version": version})

	return nil
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

func RunMigrationsAndFixes(sqlDB *sql.DB, deps dbfixes.Dependencies) error {
	if err := RunMigrations(sqlDB); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	if err := RunDataFixes(sqlDB, deps); err != nil {
		return fmt.Errorf("run data fixes: %w", err)
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
