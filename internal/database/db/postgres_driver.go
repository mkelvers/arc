package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/stdlib"
)

func init() {
	sql.Register("pgx-question", questionDriver{inner: stdlib.GetDefaultDriver()})
}

type questionDriver struct {
	inner driver.Driver
}

func (d questionDriver) Open(name string) (driver.Conn, error) {
	conn, err := d.inner.Open(name)
	if err != nil {
		return nil, err
	}
	return questionConn{inner: conn}, nil
}

type questionConn struct {
	inner driver.Conn
}

func (c questionConn) Prepare(query string) (driver.Stmt, error) {
	return c.inner.Prepare(postgresQuery(query))
}

func (c questionConn) Close() error { return c.inner.Close() }

func (c questionConn) Begin() (driver.Tx, error) { //nolint:staticcheck // driver.Conn requires the legacy method.
	return c.inner.Begin() //nolint:staticcheck // driver.Conn requires the legacy method.
}

func (c questionConn) PrepareContext(ctx context.Context, query string) (driver.Stmt, error) {
	query = postgresQuery(query)
	if conn, ok := c.inner.(driver.ConnPrepareContext); ok {
		return conn.PrepareContext(ctx, query)
	}
	return c.inner.Prepare(query)
}

func (c questionConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	query = postgresQuery(query)
	if conn, ok := c.inner.(driver.ExecerContext); ok {
		return conn.ExecContext(ctx, query, args)
	}
	stmt, err := c.PrepareContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer stmt.Close()
	values := make([]driver.Value, len(args))
	for i := range args {
		values[i] = args[i].Value
	}
	return stmt.Exec(values) //nolint:staticcheck // fallback for drivers without StmtExecContext.
}

func (c questionConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	query = postgresQuery(query)
	if conn, ok := c.inner.(driver.QueryerContext); ok {
		return conn.QueryContext(ctx, query, args)
	}
	stmt, err := c.PrepareContext(ctx, query)
	if err != nil {
		return nil, err
	}
	values := make([]driver.Value, len(args))
	for i := range args {
		values[i] = args[i].Value
	}
	return stmt.Query(values) //nolint:staticcheck // fallback for drivers without StmtQueryContext.
}

func (c questionConn) BeginTx(ctx context.Context, opts driver.TxOptions) (driver.Tx, error) {
	if conn, ok := c.inner.(driver.ConnBeginTx); ok {
		return conn.BeginTx(ctx, opts)
	}
	return c.inner.Begin() //nolint:staticcheck // fallback for drivers without ConnBeginTx.
}

func (c questionConn) Ping(ctx context.Context) error {
	if conn, ok := c.inner.(driver.Pinger); ok {
		return conn.Ping(ctx)
	}
	return nil
}

var identifierUser = regexp.MustCompile(`(?i)\buser\b`)

func postgresQuery(query string) string {
	query = replaceQuestionMarks(query)
	query = normalizeGeneratedSQL(query)
	return quoteUserIdentifier(query)
}

func replaceQuestionMarks(query string) string {
	var out strings.Builder
	out.Grow(len(query) + 8)
	index := 1
	inSingle, inDouble := false, false
	for i := 0; i < len(query); i++ {
		ch := query[i]
		if handledSingleQuote(ch, inDouble) {
			i, inSingle = writeSingleQuotedByte(&out, query, i, inSingle)
			continue
		}
		if ch == '"' && !inSingle {
			inDouble = !inDouble
			out.WriteByte(ch)
			continue
		}
		if ch == '?' && !inSingle && !inDouble {
			i, index = writePlaceholder(&out, query, i, index)
			continue
		}
		out.WriteByte(ch)
	}
	return out.String()
}

func handledSingleQuote(ch byte, inDouble bool) bool {
	return ch == '\'' && !inDouble
}

func writeSingleQuotedByte(out *strings.Builder, query string, i int, inSingle bool) (int, bool) {
	ch := query[i]
	if inSingle && i+1 < len(query) && query[i+1] == '\'' {
		out.WriteByte(ch)
		i++
		out.WriteByte(query[i])
		return i, inSingle
	}
	out.WriteByte(ch)
	return i, !inSingle
}

func writePlaceholder(out *strings.Builder, query string, i int, index int) (int, int) {
	out.WriteByte('$')
	if i+1 < len(query) && isNonZeroDigit(query[i+1]) {
		start := i + 1
		i = start
		for i+1 < len(query) && isDigit(query[i+1]) {
			i++
		}
		out.WriteString(query[start : i+1])
		return i, index
	}
	out.WriteString(strconv.Itoa(index))
	return i, index + 1
}

func isNonZeroDigit(ch byte) bool {
	return ch >= '1' && ch <= '9'
}

func isDigit(ch byte) bool {
	return ch >= '0' && ch <= '9'
}

func normalizeGeneratedSQL(query string) string {
	replacements := []struct{ old, new string }{
		{"INSERT OR IGNORE INTO", "INSERT INTO"},
		{"INSERT OR REPLACE INTO", "INSERT INTO"},
		{"datetime('now', '-7 days')", "CURRENT_TIMESTAMP - INTERVAL '7 days'"},
		{"datetime(CURRENT_TIMESTAMP, '-14 days')", "CURRENT_TIMESTAMP - INTERVAL '14 days'"},
		{"datetime(expires_at)", "expires_at"},
		{"unixepoch(MIN(expires_at))", "EXTRACT(EPOCH FROM MIN(expires_at))"},
		{"a.airing = 1", "a.airing = TRUE"},
	}
	for _, replacement := range replacements {
		query = strings.ReplaceAll(query, replacement.old, replacement.new)
	}
	return query
}

func quoteUserIdentifier(query string) string {
	var out strings.Builder
	last := 0
	for _, match := range identifierUser.FindAllStringIndex(query, -1) {
		if match[0] > 0 && query[match[0]-1] == '"' {
			continue
		}
		out.WriteString(query[last:match[0]])
		out.WriteString(`"user"`)
		last = match[1]
	}
	if last == 0 {
		return query
	}
	out.WriteString(query[last:])
	return out.String()
}
