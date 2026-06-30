package anime

import (
	"context"
	"mal/integrations/playback/allanime"
)

type seasonProvider interface {
	SeasonalShows(context.Context, string, int) ([]allanime.ProviderShow, error)
}

type SeasonDiscoveryService struct {
	provider seasonProvider
}

func NewSeasonDiscoveryService(provider *allanime.AllAnimeProvider) *SeasonDiscoveryService {
	return newSeasonDiscoveryService(provider)
}

func newSeasonDiscoveryService(provider seasonProvider) *SeasonDiscoveryService {
	return &SeasonDiscoveryService{provider: provider}
}
