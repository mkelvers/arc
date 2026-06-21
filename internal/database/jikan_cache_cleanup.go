package database

import (
	"context"
	"mal/internal/db"
	"mal/internal/observability"
	"time"

	"go.uber.org/fx"
)

const (
	jikanCacheCleanupInterval = time.Hour
	jikanCacheCleanupTimeout  = 30 * time.Second
	jikanCacheCleanupWorker   = "jikan_cache_cleanup"
)

func RegisterJikanCacheCleanupWorker(lc fx.Lifecycle, queries *db.Queries, metrics *observability.Metrics) {
	ctx, cancel := context.WithCancel(context.Background())

	lc.Append(fx.Hook{
		OnStart: func(startCtx context.Context) error {
			go func() {
				<-startCtx.Done()
				cancel()
			}()
			go runJikanCacheCleanupWorker(ctx, queries, metrics)
			return nil
		},
		OnStop: func(context.Context) error {
			cancel()
			return nil
		},
	})
}

func runJikanCacheCleanupWorker(ctx context.Context, queries *db.Queries, metrics *observability.Metrics) {
	observability.Info("jikan_cache_cleanup_worker_start", "database", "", nil)

	ticker := time.NewTicker(jikanCacheCleanupInterval)
	defer ticker.Stop()

	for {
		cleanupExpiredJikanCache(ctx, queries, metrics)

		select {
		case <-ticker.C:
		case <-ctx.Done():
			observability.Info("jikan_cache_cleanup_worker_stop", "database", "", nil)
			return
		}
	}
}

func cleanupExpiredJikanCache(ctx context.Context, queries *db.Queries, metrics *observability.Metrics) {
	cleanupCtx, cancel := context.WithTimeout(ctx, jikanCacheCleanupTimeout)
	defer cancel()

	err := queries.DeleteExpiredJikanCache(cleanupCtx)
	metrics.ObserveWorkerTick(jikanCacheCleanupWorker, err)
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
