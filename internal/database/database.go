// Package database manages database schema migrations and fixes.
package database

import (
	"database/sql"
	"embed"
	"fmt"
	"mal/internal/config"
	dbfixes "mal/internal/database/fixes"
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
	fx.Invoke(RegisterJikanCacheCleanupWorker),
)

func ProvideSQLDB(cfg config.Config) (*sql.DB, error) {
	dbConn, err := db.Open(cfg.DatabaseFile)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}
	return dbConn, nil
}

func ProvideQueries(sqlDB *sql.DB, metrics *observability.Metrics) *db.Queries {
	return db.New(observability.InstrumentDB(sqlDB, metrics))
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
func RunMigrationsAndFixes(sqlDB *sql.DB, deps dbfixes.Dependencies) error {
	if err := RunMigrations(sqlDB); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	if err := RunDataFixes(sqlDB, deps); err != nil {
		return fmt.Errorf("run data fixes: %w", err)
	}
	return nil
}
