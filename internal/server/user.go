package server

import (
	"mal/internal/domain"

	"github.com/gin-gonic/gin"
)

func CurrentUser(c *gin.Context) *domain.User {
	if c == nil {
		return nil
	}
	user, _ := c.Get("User")
	if u, ok := user.(*domain.User); ok {
		return u
	}
	return nil
}

func CurrentUserID(c *gin.Context) string {
	u := CurrentUser(c)
	if u == nil {
		return ""
	}
	return u.ID
}
