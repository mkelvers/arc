package observability

import (
	"context"
	"database/sql"
	"time"
)

type instrumentedDB struct {
	db interface {
		ExecContext(context.Context, string, ...interface{}) (sql.Result, error)
		PrepareContext(context.Context, string) (*sql.Stmt, error)
		QueryContext(context.Context, string, ...interface{}) (*sql.Rows, error)
		QueryRowContext(context.Context, string, ...interface{}) *sql.Row
	}
	metrics *Metrics
}

func InstrumentDB(db interface {
	ExecContext(context.Context, string, ...interface{}) (sql.Result, error)
	PrepareContext(context.Context, string) (*sql.Stmt, error)
	QueryContext(context.Context, string, ...interface{}) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...interface{}) *sql.Row
}, metrics *Metrics) *instrumentedDB {
	return &instrumentedDB{db: db, metrics: metrics}
}

func (db *instrumentedDB) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	start := time.Now()
	result, err := db.db.ExecContext(ctx, query, args...)
	db.metrics.ObserveDBQuery("exec", time.Since(start), err)
	return result, err
}

func (db *instrumentedDB) PrepareContext(ctx context.Context, query string) (*sql.Stmt, error) {
	return db.db.PrepareContext(ctx, query)
}

func (db *instrumentedDB) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	start := time.Now()
	rows, err := db.db.QueryContext(ctx, query, args...)
	db.metrics.ObserveDBQuery("query", time.Since(start), err)
	return rows, err
}

func (db *instrumentedDB) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	start := time.Now()
	row := db.db.QueryRowContext(ctx, query, args...)
	db.metrics.ObserveDBQuery("query_row", time.Since(start), nil)
	return row
}
