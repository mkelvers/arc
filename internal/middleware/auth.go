package middleware

import (
	"context"
	"net/http"

	"mal/internal/domain"
	ctxpkg "mal/internal/context"
)

// Auth middleware validates the session cookie and injects the user into context
func Auth(authService domain.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session_id")
			if err != nil {
				next.ServeHTTP(w, r) // no cookie, proceed unauthenticated
				return
			}

			user, err := authService.ValidateSession(r.Context(), cookie.Value)
			if err != nil {
				next.ServeHTTP(w, r) // invalid session, proceed unauthenticated
				return
			}

			ctx := context.WithValue(r.Context(), ctxpkg.UserKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUser retrieves the authenticated user from context, or nil if not authenticated
func GetUser(ctx context.Context) *domain.User {
	user, ok := ctx.Value(ctxpkg.UserKey).(*domain.User)
	if !ok {
		return nil
	}
	return user
}
