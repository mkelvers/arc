package episodes

import (
	"context"
	"log/slog"
	"mal/internal/domain"
	"time"

	"go.uber.org/fx"
)

const workerInterval = time.Minute

func RegisterWorker(lc fx.Lifecycle, svc domain.EpisodeService) {
	ctx, cancel := context.WithCancel(context.Background())

	lc.Append(fx.Hook{
		OnStart: func(startCtx context.Context) error {
			// Tie worker lifetime to fx lifecycle start context cancellation.
			go func() {
				<-startCtx.Done()
				cancel()
			}()
			go func() {
				slog.Info("episodes_worker_start", "component", "episodes")
				ticker := time.NewTicker(workerInterval)
				defer ticker.Stop()

				for {
					tickCtx, tickCancel := context.WithTimeout(ctx, 45*time.Second)
					err := svc.RefreshTrackedDue(tickCtx, 25)
					tickCancel()
					if err != nil {
						slog.Warn("episodes_worker_tick_failed", "component", "episodes", "fields", map[string]any{
							"worker": "episodes_availability",
						}, "error", err)
					}

					select {
					case <-ticker.C:
					case <-ctx.Done():
						slog.Info("episodes_worker_stop", "component", "episodes")
						return
					}
				}
			}()
			return nil
		},
		OnStop: func(context.Context) error {
			cancel()
			return nil
		},
	})
}
