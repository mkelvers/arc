package server

import (
	"mal/internal/observability"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type ErrorResponse struct {
	Error string `json:"error"`
}

func RespondHTMLOrJSONError(c *gin.Context, status int, message string) {
	if acceptsHTML(c) {
		c.String(status, message)
		c.Abort()
		return
	}
	c.JSON(status, ErrorResponse{Error: message})
	c.Abort()
}

func RespondError(c *gin.Context, status int, event string, component string, message string, fields map[string]any, err error) {
	level := observability.LogLevelWarn
	if status >= http.StatusInternalServerError {
		level = observability.LogLevelError
	}
	if fields == nil {
		fields = make(map[string]any, 2)
	}
	if _, exists := fields["request_path"]; !exists {
		fields["request_path"] = c.Request.URL.Path
	}
	if route := c.FullPath(); route != "" && route != c.Request.URL.Path {
		if _, exists := fields["request_route"]; !exists {
			fields["request_route"] = route
		}
	}
	observability.LogContext(c.Request.Context(), level, event, component, "", fields, err)
	RespondHTMLOrJSONError(c, status, message)
}

func acceptsHTML(c *gin.Context) bool {
	if strings.Contains(c.GetHeader("Accept"), "text/html") {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(c.GetHeader("HX-Request")), "true") {
		return true
	}
	return false
}
