package dbtx

import (
	"context"
	"database/sql"
	"errors"
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
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return errors.Join(err, rollbackErr)
		}
		return err
	}

	return tx.Commit()
}
