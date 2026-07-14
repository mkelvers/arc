package handler

import (
	"context"
	"errors"
	"io"
	"log/slog"
	errlog "mal/pkg"
	netutil "mal/pkg/net"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func (h *PlaybackHandler) HandleProxySubtitle(c *gin.Context) {
	targetURL, referer, ok := h.resolveProxyRequestTarget(c, "subtitle")
	if !ok {
		return
	}

	if data, contentType, ok := h.subtitleCache.Get(targetURL, time.Now()); ok {
		c.Data(http.StatusOK, contentType, data)
		return
	}

	req, err := newProxyRequest(c.Request.Context(), targetURL, referer)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}

	resp, err := h.proxyClient.Do(req)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			safeErr := errors.New("subtitle upstream request failed")
			slog.ErrorContext(c.Request.Context(), "proxy_subtitle_upstream_failed", "component", "playback", "error", safeErr)
			recordPrivateGinError(c, safeErr)
		}
		c.Status(http.StatusBadGateway)
		return
	}
	defer func() {
		errlog.Log("failed to close proxy subtitle response body", resp.Body.Close())
	}()

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.MiB2))
	if err != nil {
		safeErr := errors.New("subtitle response read failed")
		slog.ErrorContext(c.Request.Context(), "proxy_subtitle_read_failed", "component", "playback", "error", safeErr)
		recordPrivateGinError(c, safeErr)
		c.Status(http.StatusBadGateway)
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = detectSubtitleType(targetURL)
	}

	h.subtitleCache.Set(targetURL, body, contentType, time.Now())

	c.Data(http.StatusOK, contentType, body)
}

func detectSubtitleType(url string) string {
	lower := strings.ToLower(url)
	switch {
	case strings.Contains(lower, ".vtt"):
		return "text/vtt"
	case strings.Contains(lower, ".srt"):
		return "text/plain; charset=utf-8"
	case strings.Contains(lower, ".ass") || strings.Contains(lower, ".ssa"):
		return "text/plain; charset=utf-8"
	default:
		return "text/plain; charset=utf-8"
	}
}
