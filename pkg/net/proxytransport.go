package netutil

import (
	"context"
	"errors"
	"net"
	"net/http"
	"syscall"
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
		DialContext:           dialWithIPv4Fallback(dialer),
	}
}

func dialWithIPv4Fallback(dialer *net.Dialer) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network string, address string) (net.Conn, error) {
		conn, err := dialer.DialContext(ctx, network, address)
		if err == nil {
			return conn, nil
		}
		if network != "tcp" || !isUnreachableNetwork(err) {
			return nil, err
		}

		return dialer.DialContext(ctx, "tcp4", address)
	}
}

func isUnreachableNetwork(err error) bool {
	return errors.Is(err, syscall.ENETUNREACH) || errors.Is(err, syscall.EHOSTUNREACH)
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
