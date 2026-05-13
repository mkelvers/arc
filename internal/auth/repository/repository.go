package repository

import (
	"context"
	"database/sql"
	"errors"
	"mal/internal/db"
	"mal/internal/domain"
	"time"

	"github.com/google/uuid"
)

type authRepository struct {
	queries *db.Queries
}

func NewAuthRepository(queries *db.Queries) domain.AuthRepository {
	return &authRepository{queries: queries}
}

func (r *authRepository) GetUserByUsername(ctx context.Context, username string) (*domain.User, error) {
	u, err := r.queries.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (r *authRepository) GetUserByID(ctx context.Context, id string) (*domain.User, error) {
	u, err := r.queries.GetUser(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (r *authRepository) CreateSession(ctx context.Context, userID string, sessionID string) (*domain.Session, error) {
	s, err := r.queries.CreateSession(ctx, db.CreateSessionParams{
		ID:        sessionID,
		UserID:    userID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	})
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *authRepository) GetSession(ctx context.Context, sessionID string) (*domain.Session, error) {
	s, err := r.queries.GetSession(ctx, sessionID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &s, nil
}

func (r *authRepository) DeleteSession(ctx context.Context, sessionID string) error {
	return r.queries.DeleteSession(ctx, sessionID)
}
