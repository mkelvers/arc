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

type proxyTokenKey struct {
	targetURL string
	referer   string
	scope     string
}

type proxyTokenStore struct {
	mu       sync.Mutex
	tokens   map[string]proxyTokenTarget
	byTarget map[proxyTokenKey]string
}

func newProxyTokenStore() *proxyTokenStore {
	return &proxyTokenStore{
		tokens:   make(map[string]proxyTokenTarget),
		byTarget: make(map[proxyTokenKey]string),
	}
}

func (s *proxyTokenStore) create(targetURL, referer, scope string, ttl time.Duration, now time.Time) (string, error) {
	key := proxyTokenKey{targetURL: targetURL, referer: referer, scope: scope}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.pruneExpiredLocked(now)
	if token, ok := s.byTarget[key]; ok {
		if target, ok := s.tokens[token]; ok && target.expiresAt.After(now) {
			return token, nil
		}
		delete(s.byTarget, key)
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", fmt.Errorf("generate proxy token: %w", err)
	}

	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	s.tokens[token] = proxyTokenTarget{
		targetURL: targetURL,
		referer:   referer,
		scope:     scope,
		expiresAt: now.Add(ttl),
	}
	s.byTarget[key] = token
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
		delete(s.byTarget, target.key())
		return proxyTokenTarget{}, fmt.Errorf("proxy token expired")
	}
	return target, nil
}

func (s *proxyTokenStore) pruneExpiredLocked(now time.Time) {
	for token, target := range s.tokens {
		if !target.expiresAt.After(now) {
			delete(s.tokens, token)
			delete(s.byTarget, target.key())
		}
	}
}

func (t proxyTokenTarget) key() proxyTokenKey {
	return proxyTokenKey{targetURL: t.targetURL, referer: t.referer, scope: t.scope}
}
