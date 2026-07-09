package anime

import (
	"context"
	"mal/integrations/playback/allanime"
	"time"
)

type seasonProvider interface {
	SeasonalShows(context.Context, string, int) ([]allanime.ProviderShow, error)
}

type SeasonDiscoveryService struct {
	provider      seasonProvider
	seasonalCache *seasonalCache
	now           func() time.Time
}

func NewSeasonDiscoveryService(provider *allanime.AllAnimeProvider) *SeasonDiscoveryService {
	return newSeasonDiscoveryService(provider)
}

func newSeasonDiscoveryService(provider seasonProvider) *SeasonDiscoveryService {
	return &SeasonDiscoveryService{
		provider:      provider,
		seasonalCache: newSeasonalCache(seasonalCacheMaxEntries),
		now:           time.Now,
	}
}

func (s *SeasonDiscoveryService) currentTime() time.Time {
	if s.now == nil {
		return time.Now()
	}
	return s.now()
}
