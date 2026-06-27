package database

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	dbfixes "mal/internal/database/fixes"

	_ "github.com/mattn/go-sqlite3"
)

func TestRunDataFixListRunsUnappliedFixesAndRecordsSuccesses(t *testing.T) {
	sqlDB := newEmptyTestDB(t)
	defer closeTestDB(t, sqlDB)

	var applied []string
	fixes := []dbfixes.Fix{
		{
			ID: "first",
			Apply: func(ctx context.Context, sqlDB *sql.DB, deps dbfixes.Dependencies) error {
				applied = append(applied, "first")
				return nil
			},
		},
		{
			ID: "second",
			Apply: func(ctx context.Context, sqlDB *sql.DB, deps dbfixes.Dependencies) error {
				applied = append(applied, "second")
				return nil
			},
		},
	}

	if err := runDataFixList(sqlDB, dbfixes.Dependencies{}, fixes); err != nil {
		t.Fatalf("runDataFixList: %v", err)
	}

	if !reflect.DeepEqual(applied, []string{"first", "second"}) {
		t.Fatalf("applied fixes = %v, want [first second]", applied)
	}
	assertAppliedDataFixes(context.Background(), t, sqlDB, []string{"first", "second"})
}

func TestRunDataFixListSkipsAlreadyAppliedFixes(t *testing.T) {
	sqlDB := newEmptyTestDB(t)
	defer closeTestDB(t, sqlDB)

	ctx := context.Background()
	if _, err := sqlDB.ExecContext(ctx, `CREATE TABLE data_fixes (id TEXT PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		t.Fatalf("create data_fixes: %v", err)
	}
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO data_fixes (id) VALUES ('already-applied')`); err != nil {
		t.Fatalf("insert applied fix: %v", err)
	}

	var ran bool
	fixes := []dbfixes.Fix{
		{
			ID: "already-applied",
			Apply: func(ctx context.Context, sqlDB *sql.DB, deps dbfixes.Dependencies) error {
				ran = true
				return nil
			},
		},
	}

	if err := runDataFixList(sqlDB, dbfixes.Dependencies{}, fixes); err != nil {
		t.Fatalf("runDataFixList: %v", err)
	}

	if ran {
		t.Fatal("already applied fix ran")
	}
	assertAppliedDataFixes(context.Background(), t, sqlDB, []string{"already-applied"})
}

func TestRunDataFixListDoesNotRecordFailedFix(t *testing.T) {
	sqlDB := newEmptyTestDB(t)
	defer closeTestDB(t, sqlDB)

	fixErr := errors.New("boom")
	fixes := []dbfixes.Fix{
		{
			ID: "fails",
			Apply: func(ctx context.Context, sqlDB *sql.DB, deps dbfixes.Dependencies) error {
				return fixErr
			},
		},
	}

	err := runDataFixList(sqlDB, dbfixes.Dependencies{}, fixes)
	if !errors.Is(err, fixErr) {
		t.Fatalf("runDataFixList error = %v, want wrapped %v", err, fixErr)
	}

	assertAppliedDataFixes(context.Background(), t, sqlDB, nil)
}

func newEmptyTestDB(t *testing.T) *sql.DB {
	t.Helper()

	sqlDB, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	return sqlDB
}

func assertAppliedDataFixes(ctx context.Context, t *testing.T, sqlDB *sql.DB, want []string) {
	t.Helper()

	rows, err := sqlDB.QueryContext(ctx, `SELECT id FROM data_fixes ORDER BY id`)
	if err != nil {
		t.Fatalf("query data_fixes: %v", err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Errorf("close rows: %v", err)
		}
	}()

	var got []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan data_fix id: %v", err)
		}
		got = append(got, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate data_fixes: %v", err)
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("applied data fixes = %v, want %v", got, want)
	}
}
