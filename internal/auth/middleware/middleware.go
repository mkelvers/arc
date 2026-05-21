package middleware

import (
	"mal/internal/domain"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware(svc domain.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		// Allow access to login, logout and static assets without authentication
		if path == "/login" || path == "/logout" ||
			strings.HasPrefix(path, "/static") ||
			strings.HasPrefix(path, "/dist") ||
			path == "/api/auth/login" {
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
