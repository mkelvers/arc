package domain

import (
	"context"
	"mal/internal/db"
	"time"
)

type User struct {
	db.User
}

type Session struct {
	db.Session
}

type APIToken struct {
	db.ApiToken
}

const SessionLifetime = 90 * 24 * time.Hour

type AuthService interface {
	Login(ctx context.Context, username, password string) (*Session, error)
	LoginForAPIToken(ctx context.Context, username, password, name string) (token string, user *User, err error)
	ValidateSession(ctx context.Context, sessionID string) (*User, error)
	RefreshSession(ctx context.Context, sessionID string) error
	ValidateAPIToken(ctx context.Context, token string) (*User, error)
	Logout(ctx context.Context, sessionID string) error
	RevokeAllAPITokensForUser(ctx context.Context, userID string) error
}

type AuthRepository interface {
	GetUserByUsername(ctx context.Context, username string) (*User, error)
	GetUserByID(ctx context.Context, id string) (*User, error)
	CreateSession(ctx context.Context, userID string, sessionID string) (*Session, error)
	GetSession(ctx context.Context, sessionID string) (*Session, error)
	RefreshSession(ctx context.Context, sessionID string, expiresAt time.Time) error
	DeleteSession(ctx context.Context, sessionID string) error
	CreateAPIToken(ctx context.Context, userID, tokenHash, name string) (*APIToken, error)
	GetAPITokenByHash(ctx context.Context, tokenHash string) (*APIToken, error)
	TouchAPITokenLastUsedAt(ctx context.Context, tokenID string) error
	RevokeAllAPITokensForUser(ctx context.Context, userID string) error
}
