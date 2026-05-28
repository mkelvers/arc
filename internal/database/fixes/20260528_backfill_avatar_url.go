package fixes

import (
	"context"
	"database/sql"
	"fmt"
	"mal/internal"
)

func init() {
	Register(Fix{
		ID: "20260528_backfill_avatar_url",
		Apply: func(ctx context.Context, sqlDB *sql.DB) error {
			rows, err := sqlDB.QueryContext(ctx, `SELECT id, username FROM user WHERE avatar_url = ''`)
			if err != nil {
				return err
			}
			defer func() { _ = rows.Close() }()

			type userRow struct {
				id       string
				username string
			}
			toUpdate := make([]userRow, 0, 64)
			for rows.Next() {
				var r userRow
				if err := rows.Scan(&r.id, &r.username); err != nil {
					return err
				}
				toUpdate = append(toUpdate, r)
			}
			if err := rows.Err(); err != nil {
				return err
			}

			for _, u := range toUpdate {
				avatarURL := internal.DefaultAvatarURL(u.username)
				if _, err := sqlDB.ExecContext(ctx, `UPDATE user SET avatar_url = ? WHERE id = ?`, avatarURL, u.id); err != nil {
					return fmt.Errorf("update avatar_url for user %s: %w", u.id, err)
				}
			}

			return nil
		},
	})
}
