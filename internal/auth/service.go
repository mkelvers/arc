package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"mal/internal/domain"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserNotFound  = fmt.Errorf("user not found")
	ErrWrongPassword = fmt.Errorf("wrong password")
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
		return nil, ErrUserNotFound
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrWrongPassword
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
		return "", nil, ErrUserNotFound
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", nil, ErrWrongPassword
	}

	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		trimmedName = "Firefox extension"
	}

	rawToken, tokenHash, err := newOpaqueToken()
	if err != nil {
		return "", nil, err
	}
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
		if err := s.repo.DeleteSession(ctx, sessionID); err != nil {
			slog.Warn("delete_expired_session_failed", "component", "auth", "fields", map[string]any{"session_id": sessionID}, "error", err)
		}
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

	if err := s.repo.TouchAPITokenLastUsedAt(ctx, t.ID); err != nil {
		slog.Warn("touch_api_token_last_used_at_failed", "component", "auth", "fields", map[string]any{"token_id": t.ID}, "error", err)
	}
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

func newOpaqueToken() (token string, tokenHash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("generate token bytes: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(buf)

	sum := sha256.Sum256([]byte(token))
	tokenHash = hex.EncodeToString(sum[:])
	return token, tokenHash, nil
}
