package handler

import "net/http"

func copyProxyHeaders(dst http.Header, src http.Header) {
	// Skip hop-by-hop headers; see RFC 7230 section 6.1.
	// We intentionally preserve multi-value headers by copying the full slice.
	for k, v := range src {
		switch http.CanonicalHeaderKey(k) {
		case "Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade":
			continue
		}
		copied := make([]string, len(v))
		copy(copied, v)
		dst[k] = copied
	}
}
