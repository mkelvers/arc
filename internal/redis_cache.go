package internal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mal/internal/domain"
	"time"

	goRedis "github.com/redis/go-redis/v9"
)

type envelope struct {
	Payload    json.RawMessage `json:"payload"`
	FreshUntil time.Time       `json:"fresh_until"`
	StaleUntil time.Time       `json:"stale_until"`
}

type RedisCache struct {
	client *goRedis.Client
	now    func() time.Time
}

func NewRedisCache(url string) (domain.CacheStore, error) {
	if url == "" {
		return noCache{}, nil
	}
	opts, err := goRedis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis URL: %w", err)
	}
	return &RedisCache{client: goRedis.NewClient(opts), now: time.Now}, nil
}

type noCache struct{}

func (noCache) Get(context.Context, string, any) (domain.CacheResult, error) {
	return domain.CacheResult{State: domain.CacheMiss}, nil
}

func (noCache) Set(context.Context, string, any, time.Duration, time.Duration) error {
	return nil
}

func (s *RedisCache) Ping(ctx context.Context) error {
	if s == nil || s.client == nil {
		return errors.New("redis cache is not configured")
	}
	return s.client.Ping(ctx).Err()
}

func (s *RedisCache) Close() error {
	if s == nil || s.client == nil {
		return nil
	}
	return s.client.Close()
}

func (s *RedisCache) Get(ctx context.Context, key string, out any) (domain.CacheResult, error) {
	if s == nil || s.client == nil {
		return domain.CacheResult{State: domain.CacheMiss}, nil
	}
	raw, err := s.client.Get(ctx, key).Bytes()
	if err == goRedis.Nil {
		return domain.CacheResult{State: domain.CacheMiss}, nil
	}
	if err != nil {
		return domain.CacheResult{}, fmt.Errorf("get redis key %q: %w", key, err)
	}

	var item envelope
	if err := json.Unmarshal(raw, &item); err != nil {
		return domain.CacheResult{}, fmt.Errorf("decode redis key %q: %w", key, err)
	}
	now := s.now()
	if now.After(item.StaleUntil) {
		return domain.CacheResult{State: domain.CacheMiss}, nil
	}
	if err := json.Unmarshal(item.Payload, out); err != nil {
		return domain.CacheResult{}, fmt.Errorf("decode cached payload %q: %w", key, err)
	}
	if now.After(item.FreshUntil) {
		return domain.CacheResult{State: domain.CacheStale}, nil
	}
	return domain.CacheResult{State: domain.CacheFresh}, nil
}

func (s *RedisCache) Set(ctx context.Context, key string, value any, freshFor, staleFor time.Duration) error {
	if s == nil || s.client == nil {
		return nil
	}
	if freshFor <= 0 || staleFor < 0 {
		return fmt.Errorf("invalid cache lifetime: fresh=%s stale=%s", freshFor, staleFor)
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("encode cached payload %q: %w", key, err)
	}
	now := s.now()
	item, err := json.Marshal(envelope{
		Payload:    payload,
		FreshUntil: now.Add(freshFor),
		StaleUntil: now.Add(freshFor + staleFor),
	})
	if err != nil {
		return fmt.Errorf("encode cache envelope %q: %w", key, err)
	}
	return s.client.Set(ctx, key, item, freshFor+staleFor).Err()
}
