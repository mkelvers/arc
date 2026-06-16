package server

import (
	"mal/internal/domain"

	"github.com/gin-gonic/gin"
)

func CurrentUser(c *gin.Context) *domain.User {
	if c == nil {
		return nil
	}
	user, exists := c.Get("User")
	if !exists {
		return nil
	}
	u, ok := user.(*domain.User)
	if !ok {
		return nil
	}
	return u
}

func CurrentUserID(c *gin.Context) string {
	u := CurrentUser(c)
	if u == nil {
		return ""
	}
	return u.ID
}
