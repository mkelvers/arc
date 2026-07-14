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
	grouper       *CardGrouper
	seasonalCache *seasonalCache
	now           func() time.Time
}

func NewSeasonDiscoveryService(provider *allanime.AllAnimeProvider, grouper *CardGrouper) *SeasonDiscoveryService {
	return newSeasonDiscoveryService(provider, grouper)
}

func newSeasonDiscoveryService(provider seasonProvider, groupers ...*CardGrouper) *SeasonDiscoveryService {
	var grouper *CardGrouper
	if len(groupers) > 0 {
		grouper = groupers[0]
	}
	return &SeasonDiscoveryService{
		provider:      provider,
		grouper:       grouper,
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
