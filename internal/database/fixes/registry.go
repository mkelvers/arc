// Package fixes implements one-off database migration fixes.
package fixes

import (
	"context"
	"database/sql"
	"sort"
)

type Fix struct {
	ID    string
	Apply func(ctx context.Context, sqlDB *sql.DB, deps Dependencies) error
}

type Dependencies struct {
	DefaultAvatarURL func(username string) string
}

var registered []Fix

func Register(fix Fix) {
	registered = append(registered, fix)
}

func All() []Fix {
	out := append([]Fix(nil), registered...)
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}
