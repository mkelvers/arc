package server

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type ErrorResponse struct {
	Error string `json:"error"`
}

func RespondHTMLOrJSONError(c *gin.Context, status int, message string) {
	if status == http.StatusNotFound {
		RespondNotFound(c)
		return
	}
	if acceptsHTML(c) {
		c.String(status, message)
		c.Abort()
		return
	}
	c.JSON(status, ErrorResponse{Error: message})
	c.Abort()
}

func RespondError(c *gin.Context, status int, event string, component string, message string, fields map[string]any, err error) {
	level := slog.LevelWarn
	if status >= http.StatusInternalServerError {
		level = slog.LevelError
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
	args := []any{"component", component, "fields", fields}
	if err != nil {
		args = append(args, "error", err)
	}
	slog.Log(c.Request.Context(), level, event, args...)
	RespondHTMLOrJSONError(c, status, message)
}

func RespondNotFound(c *gin.Context) {
	if acceptsHTML(c) {
		c.HTML(http.StatusNotFound, "not_found.gohtml", gin.H{
			"CurrentPath": c.Request.URL.Path,
			"User":        CurrentUser(c),
		})
		c.Abort()
		return
	}
	c.JSON(http.StatusNotFound, ErrorResponse{Error: "Not found"})
	c.Abort()
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
