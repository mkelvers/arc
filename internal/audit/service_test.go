package audit_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"testing"

	"mal/internal/audit"
	"mal/internal/database"
	"mal/internal/database/db"
	"mal/internal/domain"
)

func TestRecordInsertsAuditLog(t *testing.T) {
	sqlDB := openTestDB(t)
	svc := audit.NewAuditService(db.New(sqlDB))
	insertTestUser(t, sqlDB, "user-1")

	ctx := audit.WithRequestInfo(context.Background(), "127.0.0.1", "unit-test")
	metadata, err := json.Marshal(struct {
		Foo string `json:"foo"`
	}{Foo: "bar"})
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	if err := svc.Record(ctx, domain.AuditEvent{
		UserID:       "user-1",
		Action:       "test_action",
		ResourceType: "thing",
		ResourceID:   "123",
		MetadataJSON: metadata,
	}); err != nil {
		t.Fatalf("Record: %v", err)
	}

	auditRow := queryAuditRow(t, sqlDB, "user-1")
	assertAuditRow(t, auditRow)
}

type auditRow struct {
	action       string
	resourceType string
	resourceID   string
	ip           string
	userAgent    string
	metadataJSON string
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()

	tmp, err := os.CreateTemp("", "mal-audit-*.db")
	if err != nil {
		t.Fatalf("CreateTemp: %v", err)
	}
	if err := tmp.Close(); err != nil {
		t.Fatalf("close temp db: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Remove(tmp.Name()); err != nil {
			t.Errorf("remove temp db: %v", err)
		}
	})

	sqlDB, err := db.Open(tmp.Name())
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close sqlite: %v", err)
		}
	})

	if err := database.RunMigrations(sqlDB); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}

	return sqlDB
}

func insertTestUser(t *testing.T, sqlDB *sql.DB, userID string) {
	t.Helper()

	if _, err := sqlDB.ExecContext(context.Background(), "INSERT INTO user (id, username, password_hash) VALUES (?, ?, ?)", userID, "test", "hash"); err != nil {
		t.Fatalf("insert user: %v", err)
	}
}

func queryAuditRow(t *testing.T, sqlDB *sql.DB, userID string) auditRow {
	t.Helper()

	rows, err := sqlDB.QueryContext(context.Background(), "SELECT action, resource_type, resource_id, ip, user_agent, metadata_json FROM audit_log WHERE user_id = ?", userID)
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Errorf("close audit rows: %v", err)
		}
	}()

	if !rows.Next() {
		t.Fatalf("expected audit row")
	}

	var row auditRow
	if err := rows.Scan(&row.action, &row.resourceType, &row.resourceID, &row.ip, &row.userAgent, &row.metadataJSON); err != nil {
		t.Fatalf("Scan: %v", err)
	}

	return row
}

func assertAuditRow(t *testing.T, row auditRow) {
	t.Helper()

	if row.action != "test_action" || row.resourceType != "thing" || row.resourceID != "123" {
		t.Fatalf("unexpected row action=%q resourceType=%q resourceID=%q", row.action, row.resourceType, row.resourceID)
	}
	if row.ip != "127.0.0.1" || row.userAgent != "unit-test" {
		t.Fatalf("unexpected request info ip=%q userAgent=%q", row.ip, row.userAgent)
	}
	if row.metadataJSON == "" || row.metadataJSON == "null" {
		t.Fatalf("expected metadata_json, got %q", row.metadataJSON)
	}
}
