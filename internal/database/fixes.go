package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	dbfixes "mal/internal/database/fixes"
	"mal/internal/observability"
	errlog "mal/pkg"
)

func RunDataFixes(sqlDB *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	fixes := dbfixes.All()

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

		observability.Info(
			"db_data_fix_start",
			"database",
			"",
			map[string]any{
				"id": fix.ID,
			},
		)
		if err := fix.Apply(ctx, sqlDB); err != nil {
			return fmt.Errorf("data fix %s failed: %w", fix.ID, err)
		}
		if err := markFixApplied(ctx, sqlDB, fix.ID); err != nil {
			return fmt.Errorf("mark data fix %s applied: %w", fix.ID, err)
		}
	}

	return nil
}

func ensureDataFixTable(ctx context.Context, sqlDB *sql.DB) error {
	// Safety for cases where migrations weren't run (or in tests). This is intentionally tiny and idempotent.
	_, err := sqlDB.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS data_fixes (
    id TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
	_, err := sqlDB.ExecContext(ctx, `INSERT OR IGNORE INTO data_fixes (id) VALUES (?)`, id)
	if err != nil {
		return fmt.Errorf("mark data fix applied id=%s: %w", id, err)
	}
	return nil
}
