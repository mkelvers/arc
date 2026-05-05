package worker

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	"mal/integrations/jikan"
	"mal/internal/db"
)

type Worker struct {
	db     *database.Queries
	client *jikan.Client
}

func New(db *database.Queries, client *jikan.Client) *Worker {
	return &Worker{
		db:     db,
		client: client,
	}
}

func (w *Worker) Start(ctx context.Context) {
	log.Println("Starting relations sync worker...")
	ticker := time.NewTicker(1 * time.Minute)
	retryTicker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	defer retryTicker.Stop()

	// Run once immediately
	w.runAllTasks(ctx)

	cleanupCounter := 0

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.client.RetrySignal():
			w.processAnimeFetchRetries(ctx)
		case <-retryTicker.C:
			w.processAnimeFetchRetries(ctx)
		case <-ticker.C:
			w.syncRelations(ctx)

			cleanupCounter++
			if cleanupCounter >= 60 {
				w.cleanupCache(ctx)
				cleanupCounter = 0
			}
		}
	}
}

func (w *Worker) runAllTasks(ctx context.Context) {
	var wg sync.WaitGroup
	wg.Add(3)

	go func() {
		defer wg.Done()
		w.syncRelations(ctx)
	}()

	go func() {
		defer wg.Done()
		w.processAnimeFetchRetries(ctx)
	}()

	go func() {
		defer wg.Done()
		w.cleanupCache(ctx)
	}()

	wg.Wait()
}

func retryBackoff(attempts int64) string {
	if attempts < 1 {
		attempts = 1
	}

	delay := time.Minute
	if attempts > 1 {
		shift := min(attempts-1, 6)
		delay = time.Minute * time.Duration(1<<shift)
	}

	if delay > 30*time.Minute {
		delay = 30 * time.Minute
	}

	minutes := max(int(delay/time.Minute), 1)
	return fmt.Sprintf("+%d minutes", minutes)
}

func (w *Worker) processAnimeFetchRetries(ctx context.Context) {
	retries, err := w.db.GetDueAnimeFetchRetries(ctx, 20)
	if err != nil {
		log.Printf("worker: failed to load due anime fetch retries: %v", err)
		return
	}

	if len(retries) == 0 {
		return
	}

	var wg sync.WaitGroup
	for _, retry := range retries {
		wg.Add(1)
		go func(r database.AnimeFetchRetry) {
			defer wg.Done()
			_, err := w.client.GetAnimeByID(ctx, int(r.AnimeID))
			if err != nil {
				if !jikan.IsRetryableError(err) {
					_ = w.db.DeleteAnimeFetchRetry(ctx, r.AnimeID)
					return
				}

				_ = w.db.MarkAnimeFetchRetryFailed(ctx, database.MarkAnimeFetchRetryFailedParams{
					Datetime:  retryBackoff(r.Attempts + 1),
					LastError: err.Error(),
					AnimeID:   r.AnimeID,
				})
				return
			}
			_ = w.db.DeleteAnimeFetchRetry(ctx, r.AnimeID)
		}(retry)
	}
	wg.Wait()
}

func (w *Worker) cleanupCache(ctx context.Context) {
	if err := w.db.DeleteExpiredJikanCache(ctx); err != nil {
		log.Printf("worker: failed to clean up expired jikan cache: %v", err)
	}
}

func (w *Worker) syncRelations(ctx context.Context) {
	animes, err := w.db.GetAnimeNeedingRelationSync(ctx)
	if err != nil {
		log.Printf("worker error: failed to get anime needing sync: %v", err)
		return
	}

	if len(animes) == 0 {
		return
	}

	// Use a small worker pool for Jikan API calls to respect rate limits while maintaining concurrency
	const workerCount = 2
	jobs := make(chan database.GetAnimeNeedingRelationSyncRow, len(animes))
	var wg sync.WaitGroup

	for range workerCount {
		wg.Go(func() {
			for a := range jobs {
				w.syncSingleAnime(ctx, a.ID)
			}
		})
	}

	for _, a := range animes {
		jobs <- a
	}
	close(jobs)
	wg.Wait()
}

func (w *Worker) syncSingleAnime(ctx context.Context, id int64) {
	animeData, err := w.client.GetAnimeByID(ctx, int(id))
	if err != nil {
		log.Printf("worker: failed to fetch anime details for %d: %v", id, err)
		return
	}

	for _, rel := range animeData.Relations {
		for _, entry := range rel.Entry {
			if entry.Type == "anime" {
				err := w.db.UpsertAnimeRelation(ctx, database.UpsertAnimeRelationParams{
					AnimeID:        id,
					RelatedAnimeID: int64(entry.MalID),
					RelationType:   rel.Relation,
				})
				if err != nil {
					log.Printf("worker: failed to insert relation %d -> %d: %v", id, entry.MalID, err)
				}

				if rel.Relation == "Sequel" {
					w.ensureAnimeExistsAndStatusUpdated(ctx, entry.MalID)
				}
			}
		}
	}

	_ = w.db.UpdateAnimeStatus(ctx, database.UpdateAnimeStatusParams{
		Status: sql.NullString{String: animeData.Status, Valid: true},
		ID:     id,
	})
	_ = w.db.MarkRelationsSynced(ctx, id)
}

func (w *Worker) ensureAnimeExistsAndStatusUpdated(ctx context.Context, malID int) {
	animeDetails, err := w.client.GetAnimeByID(ctx, malID)
	if err != nil {
		log.Printf("worker: failed to fetch related anime %d: %v", malID, err)
		return
	}

	_, err = w.db.UpsertAnime(ctx, database.UpsertAnimeParams{
		ID:            int64(animeDetails.MalID),
		TitleOriginal: animeDetails.Title,
		TitleEnglish:  sql.NullString{String: animeDetails.TitleEnglish, Valid: animeDetails.TitleEnglish != ""},
		TitleJapanese: sql.NullString{String: animeDetails.TitleJapanese, Valid: animeDetails.TitleJapanese != ""},
		ImageUrl:      animeDetails.ImageURL(),
		Airing:        sql.NullBool{Bool: animeDetails.Airing, Valid: true},
	})
	if err != nil {
		log.Printf("worker: failed to insert related anime %d: %v", malID, err)
	}

	_ = w.db.UpdateAnimeStatus(ctx, database.UpdateAnimeStatusParams{
		Status: sql.NullString{String: animeDetails.Status, Valid: true},
		ID:     int64(animeDetails.MalID),
	})
}
