package handler

import (
	"context"
	netutil "mal/pkg/net"
	"net/http"
)

func newProxyRequest(ctx context.Context, targetURL string, referer string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}

	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	req.Header.Set("User-Agent", netutil.Firefox121)

	return req, nil
}
