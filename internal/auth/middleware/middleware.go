package middleware

import (
	"mal/internal/domain"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware(svc domain.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionID, err := c.Cookie("session_id")
		if err == nil {
			user, err := svc.ValidateSession(c.Request.Context(), sessionID)
			if err == nil {
				c.Set("User", user)
			}
		}
		c.Next()
	}
}
