package database

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	dbfixes "mal/internal/database/fixes"
	errlog "mal/pkg"
)

func RunDataFixes(sqlDB *sql.DB, deps dbfixes.Dependencies) error {
	return runDataFixList(sqlDB, deps, dbfixes.All())
}

func runDataFixList(sqlDB *sql.DB, deps dbfixes.Dependencies, fixes []dbfixes.Fix) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if len(fixes) == 0 {
		return nil
	}

	if err := ensureDataFixTable(ctx, sqlDB); err != nil {
		return fmt.Errorf("ensure data fix table: %w", err)
	}

	applied, err := loadAppliedFixes(ctx, sqlDB)
	if err != nil {
		return fmt.Errorf("load applied data fixes: %w", err)
	}

	for _, fix := range fixes {
		if applied[fix.ID] {
			continue
		}
		slog.Info("db_data_fix_start", "component", "database", "fields", map[string]any{
			"id": fix.ID,
		})

		if err := fix.Apply(ctx, sqlDB, deps); err != nil {
			return fmt.Errorf("data fix %s failed: %w", fix.ID, err)
		}
		if err := markFixApplied(ctx, sqlDB, fix.ID); err != nil {
			return fmt.Errorf("mark data fix %s applied: %w", fix.ID, err)
		}
	}

	return nil
}

func ensureDataFixTable(ctx context.Context, sqlDB *sql.DB) error {
	// Safety for cases where the schema was not prepared yet in tests.
	_, err := sqlDB.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS data_fixes (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`)
	if err != nil {
		return fmt.Errorf("ensure data_fixes table: %w", err)
	}
	return nil
}

func loadAppliedFixes(ctx context.Context, sqlDB *sql.DB) (map[string]bool, error) {
	rows, err := sqlDB.QueryContext(ctx, `SELECT id FROM data_fixes`)
	if err != nil {
		return nil, fmt.Errorf("load applied data fixes: %w", err)
	}
	defer errlog.Close(rows, "failed to close applied data fixes rows")

	applied := make(map[string]bool)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan data fix id: %w", err)
		}
		applied[id] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate data fixes: %w", err)
	}
	return applied, nil
}

func markFixApplied(ctx context.Context, sqlDB *sql.DB, id string) error {
	_, err := sqlDB.ExecContext(ctx, `INSERT INTO data_fixes (id) VALUES (?) ON CONFLICT (id) DO NOTHING`, id)
	if err != nil {
		return fmt.Errorf("mark data fix applied id=%s: %w", id, err)
	}
	return nil
}
