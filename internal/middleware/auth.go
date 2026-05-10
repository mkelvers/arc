package middleware

import (
	"context"
	"net/http"

	"mal/api/auth"
	ctxpkg "mal/internal/context"
	"mal/internal/db"
)

func Auth(authService *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session_id")
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			user, err := authService.ValidateSession(r.Context(), cookie.Value)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), ctxpkg.UserKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetUser(ctx context.Context) *db.User {
	user, ok := ctx.Value(ctxpkg.UserKey).(*db.User)
	if !ok {
		return nil
	}
	return user
}
