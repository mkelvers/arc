package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"testing"
	"time"

	"mal/internal/db"
	"mal/internal/domain"

	"golang.org/x/crypto/bcrypt"
)

func TestAuthServiceLogin(t *testing.T) {
	passwordHash := hashPassword(t, "correct")
	repo := &fakeAuthRepository{
		usersByUsername: map[string]*domain.User{
			"alice": {User: db.User{ID: "user-1", Username: "alice", PasswordHash: passwordHash}},
		},
	}
	svc := NewAuthService(repo, &fakeAuditService{})

	session, err := svc.Login(context.Background(), "alice", "correct")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if session.UserID != "user-1" {
		t.Fatalf("session user id = %q, want %q", session.UserID, "user-1")
	}
	if session.ID == "" {
		t.Fatalf("expected generated session id")
	}
	if repo.createdSessionUserID != "user-1" {
		t.Fatalf("created session user id = %q, want user-1", repo.createdSessionUserID)
	}
}

func TestAuthServiceLoginRejectsMissingUserAndWrongPassword(t *testing.T) {
	passwordHash := hashPassword(t, "correct")
	repo := &fakeAuthRepository{
		usersByUsername: map[string]*domain.User{
			"alice": {User: db.User{ID: "user-1", Username: "alice", PasswordHash: passwordHash}},
		},
	}
	svc := NewAuthService(repo, &fakeAuditService{})

	if _, err := svc.Login(context.Background(), "missing", "correct"); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("missing user error = %v, want %v", err, ErrUserNotFound)
	}
	if _, err := svc.Login(context.Background(), "alice", "wrong"); !errors.Is(err, ErrWrongPassword) {
		t.Fatalf("wrong password error = %v, want %v", err, ErrWrongPassword)
	}
}

func TestAuthServiceValidateSession(t *testing.T) {
	repo := &fakeAuthRepository{
		usersByID: map[string]*domain.User{
			"user-1": {User: db.User{ID: "user-1", Username: "alice"}},
		},
		sessions: map[string]*domain.Session{
			"fresh":   {Session: db.Session{ID: "fresh", UserID: "user-1", ExpiresAt: time.Now().Add(time.Hour)}},
			"expired": {Session: db.Session{ID: "expired", UserID: "user-1", ExpiresAt: time.Now().Add(-time.Hour)}},
		},
	}
	svc := NewAuthService(repo, &fakeAuditService{})

	user, err := svc.ValidateSession(context.Background(), "fresh")
	if err != nil {
		t.Fatalf("ValidateSession fresh: %v", err)
	}
	if user == nil || user.ID != "user-1" {
		t.Fatalf("validated user = %#v, want user-1", user)
	}

	if _, err := svc.ValidateSession(context.Background(), "expired"); err == nil || err.Error() != "session expired" {
		t.Fatalf("expired session error = %v, want session expired", err)
	}
	if !repo.deletedSessions["expired"] {
		t.Fatalf("expected expired session to be deleted")
	}
}

func TestAuthServiceLoginForAPITokenCreatesTokenAndAuditEvent(t *testing.T) {
	passwordHash := hashPassword(t, "correct")
	repo := &fakeAuthRepository{
		usersByUsername: map[string]*domain.User{
			"alice": {User: db.User{ID: "user-1", Username: "alice", PasswordHash: passwordHash}},
		},
	}
	auditSvc := &fakeAuditService{}
	svc := NewAuthService(repo, auditSvc)

	token, user, err := svc.LoginForAPIToken(context.Background(), "alice", "correct", "  phone  ")
	if err != nil {
		t.Fatalf("LoginForAPIToken: %v", err)
	}
	if token == "" {
		t.Fatalf("expected raw token")
	}
	if user == nil || user.ID != "user-1" {
		t.Fatalf("user = %#v, want user-1", user)
	}
	if repo.createdAPITokenName != "phone" {
		t.Fatalf("api token name = %q, want phone", repo.createdAPITokenName)
	}
	if repo.createdAPITokenHash == "" || repo.createdAPITokenHash == token {
		t.Fatalf("expected stored token hash, got %q", repo.createdAPITokenHash)
	}
	if len(auditSvc.events) != 1 || auditSvc.events[0].Action != "api_token_created" {
		t.Fatalf("audit events = %#v, want api_token_created", auditSvc.events)
	}
}

func TestAuthServiceValidateAPIToken(t *testing.T) {
	rawToken := "secret-token"
	sum := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(sum[:])
	repo := &fakeAuthRepository{
		usersByID: map[string]*domain.User{
			"user-1": {User: db.User{ID: "user-1", Username: "alice"}},
		},
		apiTokensByHash: map[string]*domain.APIToken{
			tokenHash: {ApiToken: db.ApiToken{ID: "token-1", UserID: "user-1", TokenHash: tokenHash}},
		},
	}
	svc := NewAuthService(repo, &fakeAuditService{})

	user, err := svc.ValidateAPIToken(context.Background(), "  "+rawToken+"  ")
	if err != nil {
		t.Fatalf("ValidateAPIToken: %v", err)
	}
	if user == nil || user.ID != "user-1" {
		t.Fatalf("user = %#v, want user-1", user)
	}
	if repo.touchedTokenID != "token-1" {
		t.Fatalf("touched token id = %q, want token-1", repo.touchedTokenID)
	}
}

func TestAuthServiceRevokeAllAPITokensForUser(t *testing.T) {
	repo := &fakeAuthRepository{}
	auditSvc := &fakeAuditService{}
	svc := NewAuthService(repo, auditSvc)

	if err := svc.RevokeAllAPITokensForUser(context.Background(), "user-1"); err != nil {
		t.Fatalf("RevokeAllAPITokensForUser: %v", err)
	}
	if repo.revokedUserID != "user-1" {
		t.Fatalf("revoked user id = %q, want user-1", repo.revokedUserID)
	}
	if len(auditSvc.events) != 1 || auditSvc.events[0].Action != "api_token_revoked_all" {
		t.Fatalf("audit events = %#v, want api_token_revoked_all", auditSvc.events)
	}

	if err := svc.RevokeAllAPITokensForUser(context.Background(), " "); err == nil || err.Error() != "user id missing" {
		t.Fatalf("blank user id error = %v, want user id missing", err)
	}
}

func hashPassword(t *testing.T, password string) string {
	t.Helper()

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("GenerateFromPassword: %v", err)
	}
	return string(hash)
}

type fakeAuthRepository struct {
	usersByUsername map[string]*domain.User
	usersByID       map[string]*domain.User
	sessions        map[string]*domain.Session
	apiTokensByHash map[string]*domain.APIToken

	createdSessionUserID string
	createdAPITokenHash  string
	createdAPITokenName  string
	touchedTokenID       string
	revokedUserID        string
	deletedSessions      map[string]bool
}

func (r *fakeAuthRepository) GetUserByUsername(_ context.Context, username string) (*domain.User, error) {
	return r.usersByUsername[username], nil
}

func (r *fakeAuthRepository) GetUserByID(_ context.Context, id string) (*domain.User, error) {
	return r.usersByID[id], nil
}

func (r *fakeAuthRepository) CreateSession(_ context.Context, userID string, sessionID string) (*domain.Session, error) {
	r.createdSessionUserID = userID
	return &domain.Session{Session: db.Session{ID: sessionID, UserID: userID, ExpiresAt: time.Now().Add(domain.SessionLifetime)}}, nil
}

func (r *fakeAuthRepository) GetSession(_ context.Context, sessionID string) (*domain.Session, error) {
	return r.sessions[sessionID], nil
}

func (r *fakeAuthRepository) RefreshSession(_ context.Context, _ string, _ time.Time) error {
	return nil
}

func (r *fakeAuthRepository) DeleteSession(_ context.Context, sessionID string) error {
	if r.deletedSessions == nil {
		r.deletedSessions = make(map[string]bool)
	}
	r.deletedSessions[sessionID] = true
	return nil
}

func (r *fakeAuthRepository) CreateAPIToken(_ context.Context, userID, tokenHash, name string) (*domain.APIToken, error) {
	r.createdAPITokenHash = tokenHash
	r.createdAPITokenName = name
	return &domain.APIToken{ApiToken: db.ApiToken{ID: "token-1", UserID: userID, TokenHash: tokenHash, Name: name}}, nil
}

func (r *fakeAuthRepository) GetAPITokenByHash(_ context.Context, tokenHash string) (*domain.APIToken, error) {
	return r.apiTokensByHash[tokenHash], nil
}

func (r *fakeAuthRepository) TouchAPITokenLastUsedAt(_ context.Context, tokenID string) error {
	r.touchedTokenID = tokenID
	return nil
}

func (r *fakeAuthRepository) RevokeAllAPITokensForUser(_ context.Context, userID string) error {
	r.revokedUserID = userID
	return nil
}

type fakeAuditService struct {
	events []domain.AuditEvent
}

func (s *fakeAuditService) Record(_ context.Context, event domain.AuditEvent) error {
	s.events = append(s.events, event)
	return nil
}
