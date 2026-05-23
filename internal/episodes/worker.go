package episodes

import (
	"context"
	"log"
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
				log.Println("episodes: availability worker started")
				ticker := time.NewTicker(workerInterval)
				defer ticker.Stop()

				for {
					if err := svc.RefreshTrackedDue(ctx, 25); err != nil {
						metrics.ObserveWorkerTick("episodes_availability", err)
						log.Printf("episodes: availability worker tick failed error=%v", err)
					} else {
						metrics.ObserveWorkerTick("episodes_availability", nil)
					}

					select {
					case <-ticker.C:
					case <-ctx.Done():
						log.Println("episodes: availability worker stopped")
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
