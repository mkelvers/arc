package middleware

import (
	"mal/internal/domain"
	"net/http"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware(svc domain.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Allow access to login, logout and static assets without authentication
		if c.Request.URL.Path == "/login" || c.Request.URL.Path == "/logout" || 
		   len(c.Request.URL.Path) >= 7 && c.Request.URL.Path[:7] == "/static" ||
		   len(c.Request.URL.Path) >= 5 && c.Request.URL.Path[:5] == "/dist" {
			c.Next()
			return
		}

		sessionID, err := c.Cookie("session_id")
		if err != nil {
			c.Redirect(http.StatusSeeOther, "/login")
			c.Abort()
			return
		}

		user, err := svc.ValidateSession(c.Request.Context(), sessionID)
		if err != nil {
			c.Redirect(http.StatusSeeOther, "/login")
			c.Abort()
			return
		}

		c.Set("User", user)
		c.Next()
	}
}
