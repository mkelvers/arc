package fixes

import (
	"context"
	"database/sql"
	"fmt"
)

func init() {
	Register(Fix{
		ID:    "20260714_drop_audit_log",
		Apply: dropAuditLog,
	})
}

func dropAuditLog(ctx context.Context, sqlDB *sql.DB, deps Dependencies) error {
	if _, err := sqlDB.ExecContext(ctx, `DROP TABLE IF EXISTS audit_log`); err != nil {
		return fmt.Errorf("drop audit_log table: %w", err)
	}
	return nil
}
