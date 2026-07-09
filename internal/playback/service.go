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

func NewPlaybackService(repo domain.PlaybackRepository, providers []domain.Provider, _ any, episodes domain.EpisodeService, auditSvc domain.AuditService, proxyTokenKey ProxyTokenKey) domain.PlaybackService {
	return newPlaybackService(repo, providers, nil, episodes, auditSvc, proxyTokenKey)
}

func NewPlaybackServiceWithMetadata(repo domain.PlaybackRepository, providers []domain.Provider, _ any, metadata *anilist.CachedClient, episodes domain.EpisodeService, auditSvc domain.AuditService, proxyTokenKey ProxyTokenKey) domain.PlaybackService {
	return newPlaybackService(repo, providers, metadata, episodes, auditSvc, proxyTokenKey)
}

func NewPlaybackServiceWithAniList(repo domain.PlaybackRepository, providers []domain.Provider, metadata *anilist.CachedClient, episodes domain.EpisodeService, auditSvc domain.AuditService, proxyTokenKey ProxyTokenKey) domain.PlaybackService {
	return newPlaybackService(repo, providers, metadata, episodes, auditSvc, proxyTokenKey)
}

func newPlaybackService(repo domain.PlaybackRepository, providers []domain.Provider, metadata *anilist.CachedClient, episodes domain.EpisodeService, auditSvc domain.AuditService, proxyTokenKey ProxyTokenKey) domain.PlaybackService {
	return &playbackService{
		repo:          repo,
		providers:     providers,
		metadata:      metadata,
		episodes:      episodes,
		auditSvc:      auditSvc,
		httpClient:    netutil.NewClient(),
		proxyTokenKey: string(proxyTokenKey),
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
