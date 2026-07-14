package server

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const requestIDHeader = "X-Request-ID"

type requestContextKey struct{}

type RequestContext struct {
	ID    string
	Path  string
	Route string
}

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
		c.Request = c.Request.WithContext(WithRequestContext(c.Request.Context(), requestID, path, route))
		c.Next()
	}
}

func WithRequestContext(ctx context.Context, requestID string, path string, route string) context.Context {
	if ctx == nil {
		return nil
	}

	return context.WithValue(ctx, requestContextKey{}, RequestContext{
		ID:    requestID,
		Path:  path,
		Route: route,
	})
}

func RequestContextFromContext(ctx context.Context) (RequestContext, bool) {
	if ctx == nil {
		return RequestContext{}, false
	}

	requestContext, ok := ctx.Value(requestContextKey{}).(RequestContext)
	return requestContext, ok
}
