package middleware

import (
	"mal/internal/domain"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type publicRoute struct {
	method string
	path   string
	prefix bool
}

var publicRoutes = []publicRoute{
	// Pages.
	{method: http.MethodGet, path: "/login"},
	{method: http.MethodPost, path: "/login"},
	{method: http.MethodGet, path: "/logout"},

	// Static assets.
	{path: "/static", prefix: true},
	{path: "/dist", prefix: true},

	// Observability endpoints.
	{method: http.MethodGet, path: "/metrics"},

	// Auth API.
	{method: http.MethodPost, path: "/api/auth/login"},
}

func isPublicRequest(method string, path string) bool {
	for _, r := range publicRoutes {
		if r.method != "" && r.method != method {
			continue
		}
		if r.prefix {
			if strings.HasPrefix(path, r.path) {
				return true
			}
			continue
		}
		if path == r.path {
			return true
		}
	}
	return false
}

func AuthMiddleware(svc domain.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		if isPublicRequest(c.Request.Method, path) {
			c.Next()
			return
		}

		var user *domain.User
		var err error
		var sessionID string
		var usesCookieSession bool

		// API routes can authenticate via Bearer token OR cookie session.
		if strings.HasPrefix(path, "/api/") {
			authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
			if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
				token := strings.TrimSpace(authHeader[7:])
				user, err = svc.ValidateAPIToken(c.Request.Context(), token)
			} else if cookieSessionID, cookieErr := c.Cookie("session_id"); cookieErr == nil {
				sessionID = cookieSessionID
				usesCookieSession = true
				user, err = svc.ValidateSession(c.Request.Context(), sessionID)
			} else {
				err = cookieErr
			}

			if err != nil || user == nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
				c.Abort()
				return
			}
		} else {
			// Non-API routes only use cookie sessions and redirect to /login.
			cookieSessionID, cookieErr := c.Cookie("session_id")
			if cookieErr != nil {
				c.Redirect(http.StatusSeeOther, "/login")
				c.Abort()
				return
			}

			sessionID = cookieSessionID
			usesCookieSession = true
			user, err = svc.ValidateSession(c.Request.Context(), sessionID)
			if err != nil || user == nil {
				c.Redirect(http.StatusSeeOther, "/login")
				c.Abort()
				return
			}
		}

		if usesCookieSession {
			if refreshErr := svc.RefreshSession(c.Request.Context(), sessionID); refreshErr == nil {
				c.SetCookie("session_id", sessionID, int(domain.SessionLifetime.Seconds()), "/", "", false, true)
			}
		}

		c.Set("User", user)
		c.Next()
	}
}
