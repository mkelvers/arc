package dbtx

import (
	"context"
	"database/sql"
)

func Run[T any](ctx context.Context, sqlDB *sql.DB, repo T, withTx func(*sql.Tx) T, fn func(context.Context, T) error) error {
	if sqlDB == nil {
		return fn(ctx, repo)
	}

	tx, err := sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	txRepo := withTx(tx)
	if err := fn(ctx, txRepo); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}
