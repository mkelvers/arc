package handler

import (
	"context"
	"errors"
	"io"
	"mal/internal/observability"
	netutil "mal/pkg/net"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *PlaybackHandler) HandleProxyStream(c *gin.Context) {
	targetURL, referer, ok := h.resolveProxyRequestTarget(c, "stream")
	if !ok {
		return
	}

	req, err := newProxyRequest(c.Request.Context(), targetURL, referer)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}
	if ifRangeHeader := c.GetHeader("If-Range"); ifRangeHeader != "" {
		req.Header.Set("If-Range", ifRangeHeader)
	}

	resp, err := h.streamingClient.Do(req)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			observability.ErrorContext(c.Request.Context(), "proxy_stream_upstream_failed", "playback", "", map[string]any{"target_url": targetURL}, err)
			_ = c.Error(err).SetType(gin.ErrorTypePrivate)
		}
		c.Status(http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	if isHLSPlaylistResponse(targetURL, resp.Header) {
		h.writeProxyPlaylist(c, resp, targetURL, referer)
		return
	}

	copyProxyHeaders(c.Writer.Header(), resp.Header)
	c.Status(resp.StatusCode)
	if n, err := io.Copy(c.Writer, resp.Body); err != nil {
		if errors.Is(err, context.Canceled) || c.Request.Context().Err() != nil {
			return
		}
		observability.WarnContext(c.Request.Context(), "proxy_stream_copy_failed", "playback", "", map[string]any{"target_url": targetURL, "bytes_copied": n}, err)
	}
}

func (h *PlaybackHandler) writeProxyPlaylist(c *gin.Context, resp *http.Response, targetURL string, referer string) {
	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.MiB2))
	if err != nil {
		observability.ErrorContext(c.Request.Context(), "proxy_stream_playlist_read_failed", "playback", "", map[string]any{"target_url": targetURL}, err)
		_ = c.Error(err).SetType(gin.ErrorTypePrivate)
		c.Status(http.StatusBadGateway)
		return
	}

	rewritten, err := h.rewriteHLSPlaylist(string(body), targetURL, referer)
	if err != nil {
		observability.ErrorContext(c.Request.Context(), "proxy_stream_playlist_rewrite_failed", "playback", "", map[string]any{"target_url": targetURL}, err)
		_ = c.Error(err).SetType(gin.ErrorTypePrivate)
		c.Status(http.StatusBadGateway)
		return
	}

	copyProxyHeaders(c.Writer.Header(), resp.Header)
	c.Writer.Header().Del("Content-Length")
	c.Data(resp.StatusCode, "application/vnd.apple.mpegurl", []byte(rewritten))
}
