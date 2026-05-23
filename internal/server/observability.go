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

		level := observability.LogLevelInfo
		status := c.Writer.Status()
		if status >= 500 {
			level = observability.LogLevelError
		} else if status >= 400 {
			level = observability.LogLevelWarn
		}

		observability.LogJSON(
			level,
			"http_request",
			"http",
			"",
			map[string]any{
				"method":      c.Request.Method,
				"route":       route,
				"path":        path,
				"query":       query,
				"status":      status,
				"duration_ms": float64(duration.Microseconds()) / 1000,
				"bytes":       c.Writer.Size(),
				"client_ip":   c.ClientIP(),
				"errors":      c.Errors.ByType(gin.ErrorTypePrivate).String(),
			},
			nil,
		)
	}
}
