package handler

import (
	"context"
	"errors"
	"io"
	"log/slog"
	errlog "mal/pkg"
	netutil "mal/pkg/net"
	"net/http"
	"time"

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
	cacheKey := manifestCacheKey(targetURL, referer)
	if h.writeCachedPlaylist(c, cacheKey, targetURL, referer) {
		return
	}
	copyProxyRangeHeaders(req, c)

	resp, err := h.streamingClient.Do(req)
	if err != nil {
		h.handleStreamRequestError(c, err)
		return
	}
	defer func() {
		errlog.Log("failed to close proxy stream response body", resp.Body.Close())
	}()

	h.writeStreamResponse(c, resp, cacheKey, targetURL, referer)
}

func (h *PlaybackHandler) writeCachedPlaylist(c *gin.Context, cacheKey string, targetURL string, referer string) bool {
	if c.GetHeader("Range") != "" {
		return false
	}
	cached, found := h.manifestCache.get(cacheKey, time.Now())
	if !found {
		return false
	}
	slog.Info("playback_manifest_cache_hit", "component", "playback")
	h.writeProxyPlaylist(c, cached.status, cached.headers, cached.body, targetURL, referer)
	return true
}

func copyProxyRangeHeaders(req *http.Request, c *gin.Context) {
	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}
	if ifRangeHeader := c.GetHeader("If-Range"); ifRangeHeader != "" {
		req.Header.Set("If-Range", ifRangeHeader)
	}
}

func (h *PlaybackHandler) handleStreamRequestError(c *gin.Context, err error) {
	if !errors.Is(err, context.Canceled) {
		safeErr := errors.New("stream upstream request failed")
		slog.ErrorContext(c.Request.Context(), "proxy_stream_upstream_failed", "component", "playback", "error", safeErr)
		recordPrivateGinError(c, safeErr)
	}
	c.Status(http.StatusBadGateway)
}

func (h *PlaybackHandler) writeStreamResponse(c *gin.Context, resp *http.Response, cacheKey string, targetURL string, referer string) {
	if isHLSPlaylistResponse(targetURL, resp.Header) {
		slog.Info("playback_manifest_cache_miss", "component", "playback")
		body, readErr := readBoundedPlaylist(resp.Body)
		if readErr != nil {
			safeErr := errors.New("stream playlist read failed")
			slog.ErrorContext(c.Request.Context(), "proxy_stream_playlist_read_failed", "component", "playback", "error", safeErr)
			recordPrivateGinError(c, safeErr)
			c.Status(http.StatusBadGateway)
			return
		}
		h.manifestCache.set(cacheKey, resp.StatusCode, resp.Header, body, time.Now())
		h.writeProxyPlaylist(c, resp.StatusCode, resp.Header, body, targetURL, referer)
		return
	}

	copyProxyHeaders(c.Writer.Header(), resp.Header)
	c.Status(resp.StatusCode)
	copyProxyResponseBody(c, resp.Body)
}

func copyProxyResponseBody(c *gin.Context, body io.Reader) {
	n, err := io.Copy(c.Writer, body)
	if err == nil || errors.Is(err, context.Canceled) || c.Request.Context().Err() != nil {
		return
	}
	slog.WarnContext(c.Request.Context(), "proxy_stream_copy_failed", "component", "playback", "fields", map[string]any{"bytes_copied": n}, "error", err)
}

func readBoundedPlaylist(body io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, netutil.MiB2+1))
	if err != nil {
		return nil, err
	}
	if len(data) > manifestCacheMaxBodySize {
		return nil, errors.New("upstream playlist exceeds size limit")
	}
	return data, nil
}

func (h *PlaybackHandler) writeProxyPlaylist(c *gin.Context, status int, headers http.Header, body []byte, targetURL string, referer string) {
	rewritten, err := h.rewriteHLSPlaylist(string(body), targetURL, referer)
	if err != nil {
		safeErr := errors.New("stream playlist rewrite failed")
		slog.ErrorContext(c.Request.Context(), "proxy_stream_playlist_rewrite_failed", "component", "playback", "error", safeErr)
		recordPrivateGinError(c, safeErr)
		c.Status(http.StatusBadGateway)
		return
	}

	copyProxyHeaders(c.Writer.Header(), headers)
	c.Writer.Header().Del("Content-Length")
	c.Data(status, "application/vnd.apple.mpegurl", []byte(rewritten))
}
