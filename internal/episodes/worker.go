package episodes

import (
	"context"
	"mal/internal/domain"
	"mal/internal/observability"
	"time"

	"go.uber.org/fx"
)

const workerInterval = time.Minute

func RegisterWorker(lc fx.Lifecycle, svc domain.EpisodeService, metrics *observability.Metrics) {
	ctx, cancel := context.WithCancel(context.Background())

	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go func() {
				observability.Info("episodes_worker_start", "episodes", "", nil)
				ticker := time.NewTicker(workerInterval)
				defer ticker.Stop()

				for {
					if err := svc.RefreshTrackedDue(ctx, 25); err != nil {
						metrics.ObserveWorkerTick("episodes_availability", err)
						observability.Warn(
							"episodes_worker_tick_failed",
							"episodes",
							"",
							map[string]any{
								"worker": "episodes_availability",
							},
							err,
						)
					} else {
						metrics.ObserveWorkerTick("episodes_availability", nil)
					}

					select {
					case <-ticker.C:
					case <-ctx.Done():
						observability.Info("episodes_worker_stop", "episodes", "", nil)
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
