package server

import (
	"mal/internal/observability"
	"time"

	"github.com/gin-gonic/gin"
)

func RequestLogger() gin.HandlerFunc {
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
		status := c.Writer.Status()
		fields := map[string]any{
			"client_ip":   c.ClientIP(),
			"duration_ms": float64(duration.Microseconds()) / 1000,
			"method":      c.Request.Method,
			"path":        path,
			"request_id":  c.Writer.Header().Get(requestIDHeader),
			"status":      status,
		}
		privateErrors := c.Errors.ByType(gin.ErrorTypePrivate)
		var logErr error
		if len(privateErrors) > 0 {
			logErr = privateErrors.Last().Err
		}
		if route == "/watch/proxy/stream" && status < 400 && len(privateErrors) == 0 {
			return
		}
		if route != path {
			fields["route"] = route
		}
		if query != "" {
			fields["query"] = query
		}
		if size := c.Writer.Size(); size >= 0 {
			fields["bytes"] = size
		}
		if errors := privateErrors.String(); errors != "" {
			fields["errors"] = errors
		}

		observability.LogContext(
			c.Request.Context(),
			requestLogLevel(status),
			"http_request",
			"http",
			c.Request.Method+" "+path,
			fields,
			logErr,
		)
	}
}

func requestLogLevel(status int) observability.LogLevel {
	if status >= 500 {
		return observability.LogLevelError
	}
	if status >= 400 {
		return observability.LogLevelWarn
	}
	return observability.LogLevelInfo
}
