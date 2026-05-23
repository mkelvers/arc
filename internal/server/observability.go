package server

import (
	"mal/internal/observability"
	"time"

	"github.com/gin-gonic/gin"
)

func RequestLogger(metrics *observability.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		route := c.FullPath()
		if route == "" {
			route = path
		}

		duration := time.Since(start)
		metrics.ObserveHTTPRequest(c.Request.Method, route, c.Writer.Status(), duration)

		observability.LogJSON(
			observability.LogLevelInfo,
			"http_request",
			"http",
			"",
			map[string]any{
				"method":      c.Request.Method,
				"route":       route,
				"path":        path,
				"query":       query,
				"status":      c.Writer.Status(),
				"duration_ms": float64(duration.Microseconds()) / 1000,
				"bytes":       c.Writer.Size(),
				"client_ip":   c.ClientIP(),
				"errors":      c.Errors.ByType(gin.ErrorTypePrivate).String(),
			},
			nil,
		)
	}
}
