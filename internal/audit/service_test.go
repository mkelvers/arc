package audit_test

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"mal/internal/audit"
	"mal/internal/database"
	"mal/internal/db"
	"mal/internal/domain"
)

func TestRecordInsertsAuditLog(t *testing.T) {
	tmp, err := os.CreateTemp("", "mal-audit-*.db")
	if err != nil {
		t.Fatalf("CreateTemp: %v", err)
	}
	_ = tmp.Close()
	t.Cleanup(func() { _ = os.Remove(tmp.Name()) })

	sqlDB, err := db.Open(tmp.Name())
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	if err := database.RunMigrations(sqlDB); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}

	queries := db.New(sqlDB)
	svc := audit.NewAuditService(queries)

	if _, err := sqlDB.Exec("INSERT INTO user (id, username, password_hash) VALUES (?, ?, ?)", "user-1", "test", "hash"); err != nil {
		t.Fatalf("insert user: %v", err)
	}

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

	rows, err := sqlDB.Query("SELECT action, resource_type, resource_id, ip, user_agent, metadata_json FROM audit_log WHERE user_id = ?", "user-1")
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	defer func() { _ = rows.Close() }()

	if !rows.Next() {
		t.Fatalf("expected audit row")
	}

	var action, resourceType, resourceID, ip, userAgent, metadataJSON string
	if err := rows.Scan(&action, &resourceType, &resourceID, &ip, &userAgent, &metadataJSON); err != nil {
		t.Fatalf("Scan: %v", err)
	}

	if action != "test_action" || resourceType != "thing" || resourceID != "123" {
		t.Fatalf("unexpected row action=%q resourceType=%q resourceID=%q", action, resourceType, resourceID)
	}
	if ip != "127.0.0.1" || userAgent != "unit-test" {
		t.Fatalf("unexpected request info ip=%q userAgent=%q", ip, userAgent)
	}
	if metadataJSON == "" || metadataJSON == "null" {
		t.Fatalf("expected metadata_json, got %q", metadataJSON)
	}
}
