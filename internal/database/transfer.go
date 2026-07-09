package database

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

var persistentTables = []string{
	`"user"`,
	"session",
	"anime",
	"watch_list_entry",
	"continue_watching_entry",
	"notification_preference",
	"api_token",
	"skip_segment_override",
	"data_fixes",
	"audit_log",
	"recommendation_event",
	"recommendation_impression",
	"recommendation_profile_snapshot",
	"generated_subtitle",
}

// ImportSQLiteData copies user and application state into the PostgreSQL
// schema. Provider responses, retries, and derived availability caches are
// deliberately excluded; they are rebuilt through Redis and the providers.
func ImportSQLiteData(ctx context.Context, source, target *sql.DB) error {
	for _, table := range persistentTables {
		if err := importTable(ctx, source, target, table); err != nil {
			return fmt.Errorf("import %s: %w", table, err)
		}
	}
	return nil
}

func importTable(ctx context.Context, source, target *sql.DB, table string) error {
	columns, err := sqliteColumns(ctx, source, table)
	if err != nil {
		return err
	}
	if len(columns) == 0 {
		return nil
	}

	selectColumns := strings.Join(columns, ", ")
	filter := importFilter(table)
	rows, err := source.QueryContext(ctx, `SELECT `+selectColumns+` FROM `+table+filter)
	if err != nil {
		return err
	}
	defer rows.Close()

	placeholders := make([]string, len(columns))
	for i := range columns {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}
	insert := `INSERT INTO ` + table + ` (` + selectColumns + `) VALUES (` + strings.Join(placeholders, ", ") + `) ON CONFLICT DO NOTHING`

	for rows.Next() {
		values := make([]any, len(columns))
		destinations := make([]any, len(columns))
		for i := range values {
			destinations[i] = &values[i]
		}
		if err := rows.Scan(destinations...); err != nil {
			return err
		}
		for i, column := range columns {
			values[i] = normalizeImportedValue(column, values[i])
		}
		if _, err := target.ExecContext(ctx, insert, values...); err != nil {
			return err
		}
	}
	return rows.Err()
}

func importFilter(table string) string {
	switch table {
	case "session", "notification_preference", "api_token", "recommendation_profile_snapshot":
		return ` WHERE user_id IN (SELECT id FROM "user")`
	case "watch_list_entry", "continue_watching_entry", "recommendation_impression":
		return ` WHERE user_id IN (SELECT id FROM "user") AND anime_id IN (SELECT id FROM anime)`
	case "recommendation_event":
		return ` WHERE user_id IN (SELECT id FROM "user") AND (anime_id IS NULL OR anime_id IN (SELECT id FROM anime))`
	default:
		return ""
	}
}

func sqliteColumns(ctx context.Context, source *sql.DB, table string) ([]string, error) {
	rows, err := source.QueryContext(ctx, `PRAGMA table_info(`+table+`)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns := make([]string, 0)
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull, primaryKey int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return nil, err
		}
		columns = append(columns, quoteIdentifier(name))
	}
	return columns, rows.Err()
}

func normalizeImportedValue(column string, value any) any {
	if value == nil {
		return nil
	}
	name := strings.Trim(column, `"`)
	if name != "airing" && name != "completed_at_estimated" && name != "enabled" {
		return value
	}
	switch typed := value.(type) {
	case int64:
		return typed != 0
	case int:
		return typed != 0
	case []byte:
		return string(typed) != "0" && !strings.EqualFold(string(typed), "false")
	default:
		return value
	}
}

func quoteIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}
