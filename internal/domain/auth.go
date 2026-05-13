package domain

import (
	"context"
	"mal/internal/db"
)

type User = db.User
type Session = db.Session

type AuthService interface {
	Login(ctx context.Context, username, password string) (*Session, error)
	ValidateSession(ctx context.Context, sessionID string) (*User, error)
	Logout(ctx context.Context, sessionID string) error
}

type AuthRepository interface {
	GetUserByUsername(ctx context.Context, username string) (*User, error)
	GetUserByID(ctx context.Context, id string) (*User, error)
	CreateSession(ctx context.Context, userID string, sessionID string) (*Session, error)
	GetSession(ctx context.Context, sessionID string) (*Session, error)
	DeleteSession(ctx context.Context, sessionID string) error
}
