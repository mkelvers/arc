package handler

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func isHLSPlaylistResponse(targetURL string, headers http.Header) bool {
	contentType := strings.ToLower(headers.Get("Content-Type"))
	if strings.Contains(contentType, "mpegurl") || strings.Contains(contentType, "x-mpegurl") {
		return true
	}

	parsed, err := url.Parse(targetURL)
	if err != nil {
		return strings.Contains(strings.ToLower(targetURL), ".m3u8")
	}
	return strings.Contains(strings.ToLower(parsed.Path), ".m3u8")
}

func (h *PlaybackHandler) rewriteHLSPlaylist(body string, playlistURL string, referer string) (string, error) {
	baseURL, err := url.Parse(playlistURL)
	if err != nil {
		return "", fmt.Errorf("parse playlist url %q: %w", playlistURL, err)
	}

	lines := strings.SplitAfter(body, "\n")
	var out strings.Builder
	for _, line := range lines {
		lineBody := strings.TrimSuffix(line, "\n")
		newline := ""
		if strings.HasSuffix(line, "\n") {
			newline = "\n"
			lineBody = strings.TrimSuffix(lineBody, "\r")
			if strings.HasSuffix(line, "\r\n") {
				newline = "\r\n"
			}
		}

		trimmed := strings.TrimSpace(lineBody)
		rewritten := lineBody
		if trimmed != "" {
			if strings.HasPrefix(trimmed, "#") {
				rewritten, err = h.rewriteHLSQuotedURIs(lineBody, baseURL, referer)
			} else {
				rewritten, err = h.proxyPlaylistURI(trimmed, baseURL, referer)
			}
			if err != nil {
				return "", fmt.Errorf("rewrite hls playlist line %q: %w", trimmed, err)
			}
		}
		out.WriteString(rewritten)
		out.WriteString(newline)
	}

	return out.String(), nil
}

func (h *PlaybackHandler) rewriteHLSQuotedURIs(line string, baseURL *url.URL, referer string) (string, error) {
	const marker = `URI="`
	var out strings.Builder
	remaining := line
	for {
		idx := strings.Index(remaining, marker)
		if idx < 0 {
			out.WriteString(remaining)
			return out.String(), nil
		}
		out.WriteString(remaining[:idx+len(marker)])
		remaining = remaining[idx+len(marker):]
		end := strings.Index(remaining, `"`)
		if end < 0 {
			out.WriteString(remaining)
			return out.String(), nil
		}
		proxied, err := h.proxyPlaylistURI(remaining[:end], baseURL, referer)
		if err != nil {
			return "", fmt.Errorf("rewrite quoted hls uri %q: %w", remaining[:end], err)
		}
		out.WriteString(proxied)
		remaining = remaining[end:]
	}
}

func (h *PlaybackHandler) proxyPlaylistURI(rawURI string, baseURL *url.URL, referer string) (string, error) {
	target, err := baseURL.Parse(rawURI)
	if err != nil {
		return "", fmt.Errorf("parse hls uri %q: %w", rawURI, err)
	}
	token, err := h.svc.SignProxyToken(target.String(), referer, "stream")
	if err != nil {
		return "", fmt.Errorf("sign hls proxy token for %q: %w", target.String(), err)
	}
	params := url.Values{}
	params.Set("token", token)
	return "/watch/proxy/stream?" + params.Encode(), nil
}
