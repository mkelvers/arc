package auth

import (
	"net/http"
	"strings"

	"mal/internal/domain"

	"github.com/gin-gonic/gin"
)

const sessionCookieName = "session_id"

func setSessionCookie(c *gin.Context, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		Secure:   isHTTPSRequest(c.Request),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func setPersistentSessionCookie(c *gin.Context, value string) {
	setSessionCookie(c, value, int(domain.SessionLifetime.Seconds()))
}

func clearSessionCookie(c *gin.Context) {
	setSessionCookie(c, "", -1)
}

func isHTTPSRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}

	proto := r.Header.Get("X-Forwarded-Proto")
	if i := strings.IndexByte(proto, ','); i >= 0 {
		proto = proto[:i]
	}
	if strings.EqualFold(strings.TrimSpace(proto), "https") {
		return true
	}

	forwarded := r.Header.Values("Forwarded")
	for _, value := range forwarded {
		for part := range strings.SplitSeq(value, ";") {
			key, val, ok := strings.Cut(strings.TrimSpace(part), "=")
			if ok && strings.EqualFold(key, "proto") && strings.EqualFold(strings.Trim(val, `"`), "https") {
				return true
			}
		}
	}

	return false
}
