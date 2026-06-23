package cache

import (
	"context"
	"encoding/json"
	"time"

	"mal/internal/db"
	"mal/internal/observability"
)

type Store struct {
	db db.Querier
}

func NewStore(queries db.Querier) *Store {
	return &Store{db: queries}
}

// Get retrieves a fresh cached value by key.
func (s *Store) Get(parentCtx context.Context, key string, out any) bool {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()

	data, err := s.db.GetJikanCache(ctx, key)
	if err != nil {
		return false
	}

	if err := json.Unmarshal([]byte(data), out); err != nil {
		return false
	}

	return true
}

// GetStale retrieves an expired-but-available cached value by key.
func (s *Store) GetStale(parentCtx context.Context, key string, out any) bool {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()

	data, err := s.db.GetJikanCacheStale(ctx, key)
	if err != nil {
		return false
	}

	if err := json.Unmarshal([]byte(data), out); err != nil {
		return false
	}

	return true
}

// Set stores data in cache with the specified TTL.
func (s *Store) Set(parentCtx context.Context, key string, data any, ttl time.Duration) {
	ctx, cancel := context.WithTimeout(parentCtx, 2*time.Second)
	defer cancel()

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
