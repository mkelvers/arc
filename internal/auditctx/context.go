package auditctx

import "context"

type ctxKey string

const (
	ctxKeyIP        ctxKey = "audit_ip"
	ctxKeyUserAgent ctxKey = "audit_user_agent"
)

func WithRequestInfo(ctx context.Context, ip string, userAgent string) context.Context {
	if ctx == nil {
		return nil
	}
	next := context.WithValue(ctx, ctxKeyIP, ip)
	return context.WithValue(next, ctxKeyUserAgent, userAgent)
}

func RequestInfoFromContext(ctx context.Context) (ip string, userAgent string) {
	if ctx == nil {
		return "", ""
	}
	if v := ctx.Value(ctxKeyIP); v != nil {
		if s, ok := v.(string); ok {
			ip = s
		}
	}
	if v := ctx.Value(ctxKeyUserAgent); v != nil {
		if s, ok := v.(string); ok {
			userAgent = s
		}
	}
	return ip, userAgent
}

