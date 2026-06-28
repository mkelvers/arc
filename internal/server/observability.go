package server

import (
	"mal/internal/observability"
	"net/http"
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
		privateErrors := c.Errors.ByType(gin.ErrorTypePrivate)
		privateErrorText := privateErrors.String()
		var logErr error
		if len(privateErrors) > 0 {
			logErr = privateErrors.Last().Err
		}
		if route == "/watch/proxy/stream" && status < 400 && len(privateErrors) == 0 {
			return
		}
		if c.FullPath() == "" && status == http.StatusSeeOther {
			return
		}

		observability.LogContext(
			c.Request.Context(),
			requestLogLevel(status),
			"http_request",
			"http",
			c.Request.Method+" "+path,
			requestLogFields(c, path, query, route, duration, status, privateErrorText),
			logErr,
		)
	}
}

func requestLogFields(c *gin.Context, path, query, route string, duration time.Duration, status int, privateErrorText string) map[string]any {
	fields := map[string]any{
		"client_ip":   c.ClientIP(),
		"duration_ms": float64(duration.Microseconds()) / 1000,
		"method":      c.Request.Method,
		"path":        path,
		"request_id":  c.Writer.Header().Get(requestIDHeader),
		"status":      status,
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
	if privateErrorText != "" {
		fields["errors"] = privateErrorText
	}

	return fields
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
