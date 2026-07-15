package fixes

import (
	"context"
	"database/sql"
	"fmt"
)

func init() {
	Register(Fix{
		ID:    "20260716_rebuild_anime_identity_registry",
		Apply: rebuildAnimeIdentityRegistry,
	})
}

func rebuildAnimeIdentityRegistry(ctx context.Context, sqlDB *sql.DB, _ Dependencies) error {
	tx, err := sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin anime identity registry rebuild: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	statements := []string{
		`DELETE FROM anime_external_id`,
		`DELETE FROM anime_identity`,
		`INSERT INTO anime_identity (id) SELECT id FROM anime ON CONFLICT (id) DO NOTHING`,
		`INSERT INTO anime_external_id (anime_identity_id, provider, external_id)
		 SELECT id, 'mal', id::TEXT FROM anime
		 ON CONFLICT (provider, external_id) DO NOTHING`,
		`SELECT setval(
			pg_get_serial_sequence('anime_identity', 'id'),
			GREATEST(COALESCE((SELECT MAX(id) FROM anime_identity), 1), 1),
			TRUE
		)`,
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("rebuild anime identity registry: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit anime identity registry rebuild: %w", err)
	}
	return nil
}
