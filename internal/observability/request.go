package observability

import "context"

type requestContextKey struct{}

type RequestContext struct {
	ID    string
	Path  string
	Route string
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
