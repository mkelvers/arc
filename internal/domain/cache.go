package domain

import (
	"context"
	"time"
)

type CacheState string

const (
	CacheMiss  CacheState = "miss"
	CacheFresh CacheState = "fresh"
	CacheStale CacheState = "stale"
)

type CacheResult struct {
	State CacheState
}

type CacheStore interface {
	Get(ctx context.Context, key string, out any) (CacheResult, error)
	Set(ctx context.Context, key string, value any, freshFor, staleFor time.Duration) error
}
