package fixes

import (
	"context"
	"database/sql"
	"fmt"
)

func init() {
	Register(Fix{
		ID:    "20260716_refresh_anime_mapping_segments",
		Apply: refreshAnimeMappingSegments,
	})
}

func refreshAnimeMappingSegments(ctx context.Context, sqlDB *sql.DB, _ Dependencies) error {
	if _, err := sqlDB.ExecContext(ctx, `DELETE FROM anime_mapping_import`); err != nil {
		return fmt.Errorf("schedule anime mapping segment refresh: %w", err)
	}
	return nil
}
