package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mal/internal/db"
	"mal/internal/domain"

	"github.com/gin-gonic/gin"
)

func TestHandleAPILogin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	svc := &fakeAuthService{
		apiToken: "token-1",
		apiUser:  &domain.User{User: db.User{ID: "user-1", Username: "alice", AvatarUrl: "avatar.png"}},
	}
	router := gin.New()
	NewAuthHandler(svc).Register(router)

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"alice","password":"correct","name":"phone"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"token":"token-1"`) {
		t.Fatalf("response missing token: %s", rec.Body.String())
	}
	if svc.apiLoginName != "phone" {
		t.Fatalf("api token name = %q, want phone", svc.apiLoginName)
	}
}

func TestHandleAPILoginRejectsInvalidRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		body       string
		loginErr   error
		wantStatus int
	}{
		{name: "bad json", body: `{`, wantStatus: http.StatusBadRequest},
		{name: "missing password", body: `{"username":"alice"}`, wantStatus: http.StatusBadRequest},
		{name: "bad credentials", body: `{"username":"alice","password":"wrong"}`, loginErr: ErrWrongPassword, wantStatus: http.StatusUnauthorized},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeAuthService{apiLoginErr: tt.loginErr}
			router := gin.New()
			NewAuthHandler(svc).Register(router)

			rec := httptest.NewRecorder()
			req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/auth/login", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", rec.Code, tt.wantStatus, rec.Body.String())
			}
		})
	}
}

func TestAuthMiddlewareAllowsPublicRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	svc := &fakeAuthService{}
	router := gin.New()
	router.Use(AuthMiddleware(svc))
	router.GET("/static/app.js", func(c *gin.Context) { c.String(http.StatusOK, "asset") })

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/static/app.js", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if svc.validateSessionCalled || svc.validateAPITokenCalled {
		t.Fatalf("public route should not authenticate")
	}
}

func TestAuthMiddlewareAuthenticatesAPIBearerToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	svc := &fakeAuthService{user: &domain.User{User: db.User{ID: "user-1", Username: "alice"}}}
	router := gin.New()
	router.Use(AuthMiddleware(svc))
	router.GET("/api/me", func(c *gin.Context) {
		user, _ := c.Get("User")
		if user.(*domain.User).ID != "user-1" {
			c.Status(http.StatusTeapot)
			return
		}
		c.Status(http.StatusOK)
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer api-token")
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if svc.validatedAPIToken != "api-token" {
		t.Fatalf("validated api token = %q, want api-token", svc.validatedAPIToken)
	}
	if svc.refreshSessionCalled {
		t.Fatalf("bearer token auth should not refresh cookie session")
	}
}

func TestAuthMiddlewareAuthenticatesCookieSessionAndRefreshes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	svc := &fakeAuthService{user: &domain.User{User: db.User{ID: "user-1", Username: "alice"}}}
	router := gin.New()
	router.Use(AuthMiddleware(svc))
	router.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: "session-1"})
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if svc.validatedSessionID != "session-1" {
		t.Fatalf("validated session id = %q, want session-1", svc.validatedSessionID)
	}
	if svc.refreshedSessionID != "session-1" {
		t.Fatalf("refreshed session id = %q, want session-1", svc.refreshedSessionID)
	}
	if got := rec.Header().Values("Set-Cookie"); len(got) == 0 || !strings.Contains(got[0], "session_id=session-1") {
		t.Fatalf("Set-Cookie = %v, want refreshed session cookie", got)
	}
}

func TestAuthMiddlewareRejectsUnauthenticatedRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		method     string
		path       string
		wantStatus int
		wantHeader string
	}{
		{name: "api", method: http.MethodGet, path: "/api/me", wantStatus: http.StatusUnauthorized},
		{name: "page", method: http.MethodGet, path: "/", wantStatus: http.StatusSeeOther, wantHeader: "/login"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()
			router.Use(AuthMiddleware(&fakeAuthService{validateErr: errors.New("no auth")}))
			router.Handle(tt.method, tt.path, func(c *gin.Context) { c.Status(http.StatusOK) })

			rec := httptest.NewRecorder()
			req := httptest.NewRequestWithContext(context.Background(), tt.method, tt.path, nil)
			router.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if tt.wantHeader != "" && rec.Header().Get("Location") != tt.wantHeader {
				t.Fatalf("Location = %q, want %q", rec.Header().Get("Location"), tt.wantHeader)
			}
		})
	}
}

type fakeAuthService struct {
	user *domain.User

	apiToken string
	apiUser  *domain.User

	loginErr    error
	apiLoginErr error
	validateErr error

	apiLoginName            string
	validatedSessionID      string
	validatedAPIToken       string
	refreshedSessionID      string
	loggedOutSessionID      string
	validateSessionCalled   bool
	validateAPITokenCalled  bool
	refreshSessionCalled    bool
	revokedAPITokensForUser string
}

func (s *fakeAuthService) Login(_ context.Context, _, _ string) (*domain.Session, error) {
	if s.loginErr != nil {
		return nil, s.loginErr
	}
	return &domain.Session{Session: db.Session{ID: "session-1", UserID: "user-1"}}, nil
}

func (s *fakeAuthService) LoginForAPIToken(_ context.Context, _, _, name string) (string, *domain.User, error) {
	s.apiLoginName = name
	if s.apiLoginErr != nil {
		return "", nil, s.apiLoginErr
	}
	return s.apiToken, s.apiUser, nil
}

func (s *fakeAuthService) ValidateSession(_ context.Context, sessionID string) (*domain.User, error) {
	s.validateSessionCalled = true
	s.validatedSessionID = sessionID
	if s.validateErr != nil {
		return nil, s.validateErr
	}
	return s.user, nil
}

func (s *fakeAuthService) RefreshSession(_ context.Context, sessionID string) error {
	s.refreshSessionCalled = true
	s.refreshedSessionID = sessionID
	return nil
}

func (s *fakeAuthService) ValidateAPIToken(_ context.Context, token string) (*domain.User, error) {
	s.validateAPITokenCalled = true
	s.validatedAPIToken = token
	if s.validateErr != nil {
		return nil, s.validateErr
	}
	return s.user, nil
}

func (s *fakeAuthService) Logout(_ context.Context, sessionID string) error {
	s.loggedOutSessionID = sessionID
	return nil
}

func (s *fakeAuthService) RevokeAllAPITokensForUser(_ context.Context, userID string) error {
	s.revokedAPITokensForUser = userID
	return nil
}
