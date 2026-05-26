package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sort"
	"time"
)

type dataFix struct {
	id    string
	apply func(ctx context.Context, sqlDB *sql.DB) error
}

var registeredDataFixes []dataFix

func registerDataFix(fix dataFix) {
	registeredDataFixes = append(registeredDataFixes, fix)
}

func RunDataFixes(sqlDB *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	fixes := append([]dataFix(nil), registeredDataFixes...)
	sort.Slice(fixes, func(i, j int) bool { return fixes[i].id < fixes[j].id })

	if len(fixes) == 0 {
		return nil
	}

	if err := ensureDataFixTable(ctx, sqlDB); err != nil {
		return err
	}

	applied, err := loadAppliedFixes(ctx, sqlDB)
	if err != nil {
		return err
	}

	for _, fix := range fixes {
		if applied[fix.id] {
			continue
		}

		log.Printf("Running data fix id=%s", fix.id)
		if err := fix.apply(ctx, sqlDB); err != nil {
			return fmt.Errorf("data fix %s failed: %w", fix.id, err)
		}
		if err := markFixApplied(ctx, sqlDB, fix.id); err != nil {
			return err
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
	defer rows.Close()

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
