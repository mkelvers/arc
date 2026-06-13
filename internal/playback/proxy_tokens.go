package playback

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"sync"
	"time"
)

type proxyTokenTarget struct {
	targetURL string
	referer   string
	scope     string
	expiresAt time.Time
}

type proxyTokenStore struct {
	mu     sync.Mutex
	tokens map[string]proxyTokenTarget
}

func newProxyTokenStore() *proxyTokenStore {
	return &proxyTokenStore{
		tokens: make(map[string]proxyTokenTarget),
	}
}

func (s *proxyTokenStore) create(targetURL, referer, scope string, ttl time.Duration, now time.Time) (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", fmt.Errorf("generate proxy token: %w", err)
	}

	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneExpiredLocked(now)
	s.tokens[token] = proxyTokenTarget{
		targetURL: targetURL,
		referer:   referer,
		scope:     scope,
		expiresAt: now.Add(ttl),
	}
	return token, nil
}

func (s *proxyTokenStore) resolve(token string, now time.Time) (proxyTokenTarget, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	target, ok := s.tokens[token]
	if !ok {
		return proxyTokenTarget{}, fmt.Errorf("invalid proxy token")
	}
	if !target.expiresAt.After(now) {
		delete(s.tokens, token)
		return proxyTokenTarget{}, fmt.Errorf("proxy token expired")
	}
	return target, nil
}

func (s *proxyTokenStore) pruneExpiredLocked(now time.Time) {
	for token, target := range s.tokens {
		if !target.expiresAt.After(now) {
			delete(s.tokens, token)
		}
	}
}
