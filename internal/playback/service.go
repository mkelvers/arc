// Package playback manages video playback, including episode sources and subtitle management.
package playback

import (
	"fmt"
	"mal/integrations/anilist"
	"mal/internal/domain"
	"mal/internal/playback/proxytarget"
	netutil "mal/pkg/net"
	"net/http"
	"time"

	"go.uber.org/fx"
	"golang.org/x/sync/singleflight"
)

type playbackService struct {
	repo          domain.PlaybackRepository
	providers     []domain.Provider
	metadata      *anilist.CachedClient
	episodes      domain.EpisodeService
	httpClient    *http.Client
	proxyTokenKey string
	proxyTokens   *proxyTokenStore
	sourceCache   *sourceCache
	sourceFlight  singleflight.Group
	auditSvc      domain.AuditService
}

type ProxyTokenKey string

type PlaybackServiceParams struct {
	fx.In

	Repository    domain.PlaybackRepository
	Providers     []domain.Provider
	Metadata      *anilist.CachedClient
	Episodes      domain.EpisodeService
	AuditService  domain.AuditService
	ProxyTokenKey ProxyTokenKey
}

func NewPlaybackServiceWithAniList(params PlaybackServiceParams) domain.PlaybackService {
	return &playbackService{
		repo:          params.Repository,
		providers:     params.Providers,
		metadata:      params.Metadata,
		episodes:      params.Episodes,
		auditSvc:      params.AuditService,
		httpClient:    netutil.NewClient(),
		proxyTokenKey: string(params.ProxyTokenKey),
		proxyTokens:   newProxyTokenStore(),
		sourceCache:   newSourceCache(defaultSourceCacheTTL, defaultSourceCacheStaleTTL, defaultSourceCacheMaxEntries),
	}
}

func (s *playbackService) SignProxyToken(targetURL, referer, scope string) (string, error) {
	if s.proxyTokenKey == "" {
		return "", nil
	}
	if err := proxytarget.Validate(targetURL); err != nil {
		return "", err
	}
	return s.proxyTokens.create(targetURL, referer, scope, 2*time.Hour, time.Now())
}

func (s *playbackService) ResolveProxyToken(token string, scope string) (string, string, error) {
	if s.proxyTokenKey == "" {
		return "", "", fmt.Errorf("proxy token key not configured")
	}
	target, err := s.proxyTokens.resolve(token, time.Now())
	if err != nil {
		return "", "", err
	}
	if target.scope != scope {
		return "", "", fmt.Errorf("invalid proxy token scope")
	}
	return target.targetURL, target.referer, nil
}
