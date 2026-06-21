package cache

import (
	"context"
	"encoding/json"
	"time"

	"mal/internal/db"
	"mal/internal/observability"
)

type Store struct {
	db      db.Querier
	metrics *observability.Metrics
}

func NewStore(queries db.Querier, metrics *observability.Metrics) *Store {
	return &Store{db: queries, metrics: metrics}
}

// Get retrieves a fresh cached value by key.
func (s *Store) Get(parentCtx context.Context, key string, out any) bool {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()
	defer s.observeStats(parentCtx)

	data, err := s.db.GetJikanCache(ctx, key)
	if err != nil {
		s.metrics.ObserveCache("jikan", "miss")
		return false
	}

	if err := json.Unmarshal([]byte(data), out); err != nil {
		s.metrics.ObserveCache("jikan", "miss")
		return false
	}

	s.metrics.ObserveCache("jikan", "hit")
	return true
}

// GetStale retrieves an expired-but-available cached value by key.
func (s *Store) GetStale(parentCtx context.Context, key string, out any) bool {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()
	defer s.observeStats(parentCtx)

	data, err := s.db.GetJikanCacheStale(ctx, key)
	if err != nil {
		s.metrics.ObserveCache("jikan_stale", "miss")
		return false
	}

	if err := json.Unmarshal([]byte(data), out); err != nil {
		s.metrics.ObserveCache("jikan_stale", "miss")
		return false
	}

	s.metrics.ObserveCache("jikan_stale", "hit")
	return true
}

// Set stores data in cache with the specified TTL.
func (s *Store) Set(parentCtx context.Context, key string, data any, ttl time.Duration) {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()
	defer s.observeStats(parentCtx)

	bytes, err := json.Marshal(data)
	if err != nil {
		return
	}

	err = s.db.SetJikanCache(ctx, db.SetJikanCacheParams{
		Key:       key,
		Data:      string(bytes),
		ExpiresAt: time.Now().Add(ttl),
	})
	if err != nil {
		observability.LogJSON(
			observability.LogLevelError,
			"jikan_cache_set",
			"jikan",
			"",
			map[string]any{"cache_key": key},
			err,
		)
	}
}

func (s *Store) observeStats(parentCtx context.Context) {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()

	stats, err := s.db.GetJikanCacheStats(ctx)
	if err != nil {
		observability.LogJSON(
			observability.LogLevelWarn,
			"jikan_cache_stats",
			"jikan",
			"",
			nil,
			err,
		)
		return
	}
	s.metrics.ObserveJikanCacheStats(stats.TotalRows, stats.ExpiredRows, stats.OldestExpiresAtSeconds)
}
