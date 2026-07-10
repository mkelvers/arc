package internal

import (
	"context"
	"database/sql"
	"net/url"
	"strings"

	"mal/integrations/anilist"
	"mal/internal/database"
	dbfixes "mal/internal/database/fixes"
)

func DefaultAvatarURL(username string) string {
	params := url.Values{}
	params.Set("seed", strings.TrimSpace(username))
	return "https://api.dicebear.com/9.x/dylan/svg?" + params.Encode()
}

func RunPostgresMigrationsAndFixes(sqlDB *sql.DB, metadata *anilist.CachedClient) error {
	return database.RunPostgresMigrationsAndFixes(sqlDB, DataFixDependencies(metadata))
}

type animeDataFixClient interface {
	GetAnimeByMALID(ctx context.Context, id int) (anilist.Anime, error)
}

func DataFixDependencies(metadata animeDataFixClient) dbfixes.Dependencies {
	return dbfixes.Dependencies{
		DefaultAvatarURL: DefaultAvatarURL,
		AnimeBannerURL: func(ctx context.Context, animeID int64) (string, error) {
			anime, err := metadata.GetAnimeByMALID(ctx, int(animeID))
			if err != nil {
				return "", err
			}
			return anime.BannerImage, nil
		},
	}
}
