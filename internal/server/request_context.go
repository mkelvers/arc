package server

import (
	"mal/internal/observability"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const requestIDHeader = "X-Request-ID"

func RequestContextMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := strings.TrimSpace(c.GetHeader(requestIDHeader))
		if requestID == "" {
			requestID = uuid.NewString()
		}

		path := c.Request.URL.Path
		route := c.FullPath()
		if route == "" {
			route = path
		}

		c.Writer.Header().Set(requestIDHeader, requestID)
		c.Request = c.Request.WithContext(observability.WithRequestContext(c.Request.Context(), requestID, path, route))
		c.Next()
	}
}
