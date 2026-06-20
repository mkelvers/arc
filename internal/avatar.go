package internal

import (
	"database/sql"
	"net/url"
	"strings"

	"mal/internal/database"
	dbfixes "mal/internal/database/fixes"
)

func DefaultAvatarURL(username string) string {
	params := url.Values{}
	params.Set("seed", strings.TrimSpace(username))
	return "https://api.dicebear.com/9.x/dylan/svg?" + params.Encode()
}

func RunMigrationsAndFixes(sqlDB *sql.DB) error {
	return database.RunMigrationsAndFixes(sqlDB, dbfixes.Dependencies{
		DefaultAvatarURL: DefaultAvatarURL,
	})
}
