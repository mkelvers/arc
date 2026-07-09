// Package redis provides JSON response caching with a stale-data window.
package redis

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	goRedis "github.com/redis/go-redis/v9"
)

type State string

const (
	StateMiss  State = "miss"
	StateFresh State = "fresh"
	StateStale State = "stale"
)

type Result struct {
	State State
}

type envelope struct {
	Payload    json.RawMessage `json:"payload"`
	FreshUntil time.Time       `json:"fresh_until"`
	StaleUntil time.Time       `json:"stale_until"`
}

type Store struct {
	client *goRedis.Client
	now    func() time.Time
}

func New(url string) (*Store, error) {
	if url == "" {
		return nil, nil
	}
	opts, err := goRedis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis URL: %w", err)
	}
	return &Store{client: goRedis.NewClient(opts), now: time.Now}, nil
}

func NewWithClient(client *goRedis.Client) *Store {
	return &Store{client: client, now: time.Now}
}

func (s *Store) Ping(ctx context.Context) error {
	if s == nil || s.client == nil {
		return errors.New("redis cache is not configured")
	}
	return s.client.Ping(ctx).Err()
}

func (s *Store) Close() error {
	if s == nil || s.client == nil {
		return nil
	}
	return s.client.Close()
}

func (s *Store) Get(ctx context.Context, key string, out any) (Result, error) {
	if s == nil || s.client == nil {
		return Result{State: StateMiss}, nil
	}
	raw, err := s.client.Get(ctx, key).Bytes()
	if err == goRedis.Nil {
		return Result{State: StateMiss}, nil
	}
	if err != nil {
		return Result{}, fmt.Errorf("get redis key %q: %w", key, err)
	}

	var item envelope
	if err := json.Unmarshal(raw, &item); err != nil {
		return Result{}, fmt.Errorf("decode redis key %q: %w", key, err)
	}
	now := s.now()
	if now.After(item.StaleUntil) {
		return Result{State: StateMiss}, nil
	}
	if err := json.Unmarshal(item.Payload, out); err != nil {
		return Result{}, fmt.Errorf("decode cached payload %q: %w", key, err)
	}
	if now.After(item.FreshUntil) {
		return Result{State: StateStale}, nil
	}
	return Result{State: StateFresh}, nil
}

func (s *Store) Set(ctx context.Context, key string, value any, freshFor, staleFor time.Duration) error {
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
