package service

import (
	"context"
	"errors"
	"mal/internal/domain"
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

func (s *authService) Logout(ctx context.Context, sessionID string) error {
	return s.repo.DeleteSession(ctx, sessionID)
}
