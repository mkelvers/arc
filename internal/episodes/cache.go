package episodes

import (
	"context"
	"fmt"
	"time"

	rediscache "mal/internal/cache/redis"
	"mal/internal/domain"
)

type cachedAvailabilityProvider struct {
	inner domain.EpisodeAvailabilityProvider
	cache *rediscache.Store
}

func newCachedAvailabilityProvider(inner domain.EpisodeAvailabilityProvider, cache *rediscache.Store) domain.EpisodeAvailabilityProvider {
	return &cachedAvailabilityProvider{inner: inner, cache: cache}
}

func (p *cachedAvailabilityProvider) Name() string {
	return p.inner.Name()
}

func (p *cachedAvailabilityProvider) ResolveEpisodeProviderID(ctx context.Context, animeID int, titleCandidates []string) (string, error) {
	return p.inner.ResolveEpisodeProviderID(ctx, animeID, titleCandidates)
}

func (p *cachedAvailabilityProvider) GetEpisodeAvailabilityByProviderID(ctx context.Context, providerID string) (domain.EpisodeAvailability, error) {
	key := fmt.Sprintf("allanime:availability:%s", providerID)
	var cached domain.EpisodeAvailability
	result, _ := p.cache.Get(ctx, key, &cached)
	if result.State == rediscache.StateFresh {
		return cached, nil
	}

	fetched, err := p.inner.GetEpisodeAvailabilityByProviderID(ctx, providerID)
	if err == nil {
		_ = p.cache.Set(ctx, key, fetched, 7*24*time.Hour, 7*24*time.Hour)
		return fetched, nil
	}
	if result.State == rediscache.StateStale {
		return cached, nil
	}
	return domain.EpisodeAvailability{}, err
}
