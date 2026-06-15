package netutil

import (
	"net"
	"net/http"
	"time"
)

func newTransport(dialTimeout, tlsTimeout, headerTimeout time.Duration) *http.Transport {
	dialer := &net.Dialer{Timeout: dialTimeout}

	return &http.Transport{
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   tlsTimeout,
		ResponseHeaderTimeout: headerTimeout,
		ExpectContinueTimeout: 1 * time.Second,
		DialContext:           dialer.DialContext,
	}
}

func NewClient() *http.Client {
	return &http.Client{
		Transport: newTransport(10*time.Second, 10*time.Second, 30*time.Second),
		Timeout:   60 * time.Second,
	}
}

func NewStreamingClient() *http.Client {
	return &http.Client{
		Transport: newTransport(10*time.Second, 10*time.Second, 15*time.Second),
		// No client timeout: streaming responses may stay open indefinitely.
	}
}
