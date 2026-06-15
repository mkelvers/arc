package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *PlaybackHandler) resolveProxyRequestTarget(c *gin.Context, scope string) (string, string, bool) {
	token := c.Query("token")
	if token == "" {
		c.Status(http.StatusBadRequest)
		return "", "", false
	}

	targetURL, referer, err := h.svc.ResolveProxyToken(token, scope)
	if err != nil {
		c.Status(http.StatusForbidden)
		return "", "", false
	}

	return targetURL, referer, true
}
