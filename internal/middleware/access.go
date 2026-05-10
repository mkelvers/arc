package middleware

import (
	"net/http"
	"strings"
)

type AccessPolicy struct {
	PublicPaths map[string]struct{} // exact match paths (e.g. /login)
	PublicHeads []string            // prefix match paths (e.g. /static/)
}

func NewAccessPolicy() AccessPolicy {
	return AccessPolicy{
		PublicPaths: map[string]struct{}{
			"/login": {}, // login page is public
		},
		PublicHeads: []string{
			"/static/", // static assets
			"/dist/",   // bundled assets
		},
	}
}

func (p AccessPolicy) IsPublicPath(path string) bool {
	if _, ok := p.PublicPaths[path]; ok {
		return true
	}

	for _, head := range p.PublicHeads {
		if strings.HasPrefix(path, head) {
			return true
		}
	}

	return false
}

// RequireGlobalAuthWithPolicy redirects unauthenticated users to /login
// uses HX-Redirect for HTMX requests, regular redirect otherwise
func RequireGlobalAuthWithPolicy(policy AccessPolicy) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if policy.IsPublicPath(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			user := GetUser(r.Context())
			ok := user != nil
			if !ok || user == nil {
				if strings.HasPrefix(r.URL.Path, "/api/") || r.Header.Get("HX-Request") == "true" {
					w.Header().Set("HX-Redirect", "/login")
					http.Error(w, "Unauthorized", http.StatusUnauthorized)
				} else {
					http.Redirect(w, r, "/login", http.StatusFound)
				}
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
