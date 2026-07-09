package database

import (
	"context"
	"mal/internal/database/db"
	"mal/internal/observability"
	"time"

	"go.uber.org/fx"
)

const (
	jikanCacheCleanupInterval = time.Hour
	jikanCacheCleanupTimeout  = 30 * time.Second
	jikanCacheCleanupWorker   = "jikan_cache_cleanup"
)

func RegisterJikanCacheCleanupWorker(lc fx.Lifecycle, queries *db.Queries) {
	ctx, cancel := context.WithCancel(context.Background())

	lc.Append(fx.Hook{
		OnStart: func(startCtx context.Context) error {
			go func() {
				<-startCtx.Done()
				cancel()
			}()
			go runJikanCacheCleanupWorker(ctx, queries)
			return nil
		},
		OnStop: func(context.Context) error {
			cancel()
			return nil
		},
	})
}

func runJikanCacheCleanupWorker(ctx context.Context, queries *db.Queries) {
	observability.Info("jikan_cache_cleanup_worker_start", "database", "", nil)

	ticker := time.NewTicker(jikanCacheCleanupInterval)
	defer ticker.Stop()

	for {
		cleanupExpiredJikanCache(ctx, queries)

		select {
		case <-ticker.C:
		case <-ctx.Done():
			observability.Info("jikan_cache_cleanup_worker_stop", "database", "", nil)
			return
		}
	}
}

func cleanupExpiredJikanCache(ctx context.Context, queries *db.Queries) {
	cleanupCtx, cancel := context.WithTimeout(ctx, jikanCacheCleanupTimeout)
	defer cancel()

	err := queries.DeleteExpiredJikanCache(cleanupCtx)
	if err != nil {
		observability.Warn(
			"jikan_cache_cleanup_failed",
			"database",
			"",
			map[string]any{
				"worker": jikanCacheCleanupWorker,
			},
			err,
		)
	}
}
