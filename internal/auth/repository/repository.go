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
	return &domain.User{User: u}, nil
}

func (r *authRepository) GetUserByID(ctx context.Context, id string) (*domain.User, error) {
	u, err := r.queries.GetUser(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &domain.User{User: u}, nil
}

func (r *authRepository) CreateSession(ctx context.Context, userID string, sessionID string) (*domain.Session, error) {
	s, err := r.queries.CreateSession(ctx, db.CreateSessionParams{
		ID:        sessionID,
		UserID:    userID,
		ExpiresAt: time.Now().Add(domain.SessionLifetime),
	})
	if err != nil {
		return nil, err
	}
	return &domain.Session{Session: s}, nil
}

func (r *authRepository) GetSession(ctx context.Context, sessionID string) (*domain.Session, error) {
	s, err := r.queries.GetSession(ctx, sessionID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &domain.Session{Session: s}, nil
}

func (r *authRepository) RefreshSession(ctx context.Context, sessionID string, expiresAt time.Time) error {
	return r.queries.RefreshSession(ctx, db.RefreshSessionParams{
		ExpiresAt: expiresAt,
		ID:        sessionID,
	})
}

func (r *authRepository) DeleteSession(ctx context.Context, sessionID string) error {
	return r.queries.DeleteSession(ctx, sessionID)
}

func (r *authRepository) CreateAPIToken(ctx context.Context, userID, tokenHash, name string) (*domain.APIToken, error) {
	t, err := r.queries.CreateAPIToken(ctx, db.CreateAPITokenParams{
		ID:        uuid.New().String(),
		UserID:    userID,
		TokenHash: tokenHash,
		Name:      name,
	})
	if err != nil {
		return nil, err
	}
	return &domain.APIToken{ApiToken: t}, nil
}

func (r *authRepository) GetAPITokenByHash(ctx context.Context, tokenHash string) (*domain.APIToken, error) {
	t, err := r.queries.GetAPITokenByHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &domain.APIToken{ApiToken: t}, nil
}

func (r *authRepository) TouchAPITokenLastUsedAt(ctx context.Context, tokenID string) error {
	return r.queries.TouchAPITokenLastUsedAt(ctx, tokenID)
}

func (r *authRepository) RevokeAllAPITokensForUser(ctx context.Context, userID string) error {
	return r.queries.RevokeAllAPITokensForUser(ctx, userID)
}
