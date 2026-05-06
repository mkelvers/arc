package utls

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"time"

	utls "github.com/refraction-networking/utls"
	"golang.org/x/net/http2"
)

// UtlsRoundTripper uses uTLS + HTTP/2 to mimic Firefox and bypass Cloudflare JA3 detection
type UtlsRoundTripper struct{}

func (rt *UtlsRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	host := req.URL.Hostname()
	port := req.URL.Port()
	if port == "" {
		if req.URL.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	addr := net.JoinHostPort(host, port)

	rawConn, err := dialer.DialContext(req.Context(), "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("tcp dial: %w", err)
	}

	uconn := utls.UClient(rawConn, &utls.Config{
		ServerName: host,
		NextProtos: []string{"h2", "http/1.1"},
	}, utls.HelloFirefox_120)

	if err := uconn.HandshakeContext(req.Context()); err != nil {
		uconn.Close()
		return nil, fmt.Errorf("utls handshake: %w", err)
	}

	alpn := uconn.ConnectionState().NegotiatedProtocol
	if alpn == "h2" {
		t := &http2.Transport{}
		cc, err := t.NewClientConn(uconn)
		if err != nil {
			uconn.Close()
			return nil, fmt.Errorf("http2 client conn: %w", err)
		}
		return cc.RoundTrip(req)
	}

	// Fallback to HTTP/1.1
	if err := req.Write(uconn); err != nil {
		uconn.Close()
		return nil, fmt.Errorf("http1 write: %w", err)
	}
	return http.ReadResponse(bufio.NewReader(uconn), req)
}
