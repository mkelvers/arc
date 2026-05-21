package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"mal/internal/domain"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type authService struct {
	repo domain.AuthRepository
}

func NewAuthService(repo domain.AuthRepository) domain.AuthService {
	return &authService{repo: repo}
}

func (s *authService) Login(ctx context.Context, username, password string) (*domain.Session, error) {
	user, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	sessionID := uuid.New().String()
	return s.repo.CreateSession(ctx, user.ID, sessionID)
}

func (s *authService) LoginForAPIToken(ctx context.Context, username, password, name string) (string, *domain.User, error) {
	user, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		return "", nil, err
	}
	if user == nil {
		return "", nil, errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		trimmedName = "Firefox extension"
	}

	rawToken, tokenHash := newOpaqueToken()
	if _, err := s.repo.CreateAPIToken(ctx, user.ID, tokenHash, trimmedName); err != nil {
		return "", nil, err
	}

	return rawToken, user, nil
}

func (s *authService) ValidateSession(ctx context.Context, sessionID string) (*domain.User, error) {
	session, err := s.repo.GetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, errors.New("session not found")
	}

	if session.ExpiresAt.Before(time.Now()) {
		_ = s.repo.DeleteSession(ctx, sessionID)
		return nil, errors.New("session expired")
	}

	return s.repo.GetUserByID(ctx, session.UserID)
}

func (s *authService) RefreshSession(ctx context.Context, sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return errors.New("session id missing")
	}

	return s.repo.RefreshSession(ctx, sessionID, time.Now().Add(domain.SessionLifetime))
}

func (s *authService) ValidateAPIToken(ctx context.Context, token string) (*domain.User, error) {
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return nil, errors.New("token missing")
	}

	sum := sha256.Sum256([]byte(trimmed))
	tokenHash := hex.EncodeToString(sum[:])

	t, err := s.repo.GetAPITokenByHash(ctx, tokenHash)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, errors.New("token not found")
	}

	_ = s.repo.TouchAPITokenLastUsedAt(ctx, t.ID)
	return s.repo.GetUserByID(ctx, t.UserID)
}

func (s *authService) Logout(ctx context.Context, sessionID string) error {
	return s.repo.DeleteSession(ctx, sessionID)
}

func (s *authService) RevokeAllAPITokensForUser(ctx context.Context, userID string) error {
	if strings.TrimSpace(userID) == "" {
		return errors.New("user id missing")
	}
	return s.repo.RevokeAllAPITokensForUser(ctx, userID)
}

func newOpaqueToken() (token string, tokenHash string) {
	buf := make([]byte, 32)
	_, _ = rand.Read(buf)
	token = base64.RawURLEncoding.EncodeToString(buf)

	sum := sha256.Sum256([]byte(token))
	tokenHash = hex.EncodeToString(sum[:])
	return token, tokenHash
}
