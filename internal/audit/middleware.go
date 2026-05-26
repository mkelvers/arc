package audit

import (
	"net"
	"strings"

	"github.com/gin-gonic/gin"
	"mal/internal/auditctx"
)

func ContextMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := clientIP(c.ClientIP())
		userAgent := strings.TrimSpace(c.GetHeader("User-Agent"))
		c.Request = c.Request.WithContext(auditctx.WithRequestInfo(c.Request.Context(), ip, userAgent))
		c.Next()
	}
}

func clientIP(ip string) string {
	trimmed := strings.TrimSpace(ip)
	if trimmed == "" {
		return ""
	}
	parsed := net.ParseIP(trimmed)
	if parsed == nil {
		return trimmed
	}
	return parsed.String()
}
