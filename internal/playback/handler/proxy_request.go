package handler

import (
	"context"
	"fmt"
	"log/slog"
	"mal/internal/playback/proxytarget"
	netutil "mal/pkg/net"
	"net/http"

	"github.com/gin-gonic/gin"
)

func newProxyRequest(ctx context.Context, targetURL string, referer string) (*http.Request, error) {
	if err := proxytarget.Validate(targetURL); err != nil {
		return nil, fmt.Errorf("validate proxy target: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build proxy request: %w", err)
	}

	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	req.Header.Set("User-Agent", netutil.Firefox121)

	return req, nil
}

func recordPrivateGinError(c *gin.Context, err error) {
	if recorded := c.Error(err).SetType(gin.ErrorTypePrivate); recorded == nil {
		slog.WarnContext(c.Request.Context(), "gin_error_record_failed", "component", "playback", "error", err)
	}
}
