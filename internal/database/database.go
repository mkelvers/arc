// Package database manages database schema migrations and fixes.
package database

import (
	"database/sql"
	"embed"
	"fmt"
	"mal/internal/config"
	"mal/internal/db"
	"mal/internal/observability"

	"github.com/pressly/goose/v3"
	"go.uber.org/fx"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

var Module = fx.Options(
	fx.Provide(
		ProvideSQLDB,
		ProvideQueries,
	),
	fx.Invoke(RunMigrationsAndFixes),
)

func ProvideSQLDB(cfg config.Config) (*sql.DB, error) {
	dbConn, err := db.Open(cfg.DatabaseFile)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}
	return dbConn, nil
}

func ProvideQueries(sqlDB *sql.DB) *db.Queries {
	return db.New(sqlDB)
}

func RunMigrations(sqlDB *sql.DB) error {
	goose.SetBaseFS(migrationsFS)

	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("failed to set goose dialect: %w", err)
	}

	observability.Info("db_migrations_start", "database", "", nil)
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}
func RunMigrationsAndFixes(sqlDB *sql.DB) error {
	if err := RunMigrations(sqlDB); err != nil {
		return err
	}
	return RunDataFixes(sqlDB)
}
