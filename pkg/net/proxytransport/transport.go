package proxytransport

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"
)

var dnsCache sync.Map

func init() {
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			dnsCache.Range(func(key, _ any) bool {
				dnsCache.Delete(key)
				return true
			})
		}
	}()
}

func newTransport(dialTimeout, tlsTimeout, headerTimeout time.Duration) *http.Transport {
	return &http.Transport{
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   tlsTimeout,
		ResponseHeaderTimeout: headerTimeout,
		ExpectContinueTimeout: 1 * time.Second,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			ips, ok := dnsCache.Load(host)
			if !ok {
				resolved, err := net.DefaultResolver.LookupIPAddr(ctx, host)
				if err != nil {
					return nil, fmt.Errorf("proxy dns lookup: %w", err)
				}
				dnsCache.Store(host, resolved)
				ips = resolved
			}

			return dialIPs(ctx, network, host, port, ips.([]net.IPAddr), dialTimeout)
		},
	}
}

func dialIPs(ctx context.Context, network, host, port string, ips []net.IPAddr, timeout time.Duration) (net.Conn, error) {
	var firstErr error
	for _, ip := range ips {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		dialer := net.Dialer{Timeout: timeout}
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return conn, nil
		}
		if firstErr == nil {
			firstErr = err
		}
	}
	return nil, fmt.Errorf("proxy dial %s: %w", host, firstErr)
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
	}
}
