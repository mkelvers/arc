package proxytarget

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

type ipResolver interface {
	LookupIPAddr(context.Context, string) ([]net.IPAddr, error)
}

func Validate(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("parse proxy target: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("proxy target scheme must be http or https")
	}
	host := parsed.Hostname()
	if host == "" {
		return fmt.Errorf("proxy target host is required")
	}
	if isLocalhostName(host) {
		return fmt.Errorf("proxy target host is local")
	}
	if addr, err := netip.ParseAddr(host); err == nil && !isAllowedAddr(addr) {
		return fmt.Errorf("proxy target address is not allowed")
	}
	return nil
}

func NewClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Transport:     newTransport(10*time.Second, 10*time.Second, 30*time.Second),
		Timeout:       timeout,
		CheckRedirect: checkRedirect,
	}
}

func NewStreamingClient() *http.Client {
	return &http.Client{
		Transport:     newTransport(10*time.Second, 10*time.Second, 15*time.Second),
		CheckRedirect: checkRedirect,
	}
}

func checkRedirect(req *http.Request, _ []*http.Request) error {
	return Validate(req.URL.String())
}

func newTransport(dialTimeout, tlsTimeout, headerTimeout time.Duration) *http.Transport {
	dialer := &net.Dialer{Timeout: dialTimeout}
	return &http.Transport{
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   tlsTimeout,
		ResponseHeaderTimeout: headerTimeout,
		ExpectContinueTimeout: 1 * time.Second,
		DialContext:           validatingDialContext(dialer, net.DefaultResolver),
	}
}

func validatingDialContext(dialer *net.Dialer, resolver ipResolver) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network string, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, fmt.Errorf("parse proxy target address: %w", err)
		}
		if isLocalhostName(host) {
			return nil, fmt.Errorf("proxy target host is local")
		}

		if addr, err := netip.ParseAddr(host); err == nil {
			if !isAllowedAddr(addr) {
				return nil, fmt.Errorf("proxy target address is not allowed")
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(addr.String(), port))
		}

		ips, err := resolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, fmt.Errorf("resolve proxy target host: %w", err)
		}
		for _, ip := range ips {
			addr, ok := addrFromIP(ip.IP)
			if !ok || !isAllowedAddr(addr) {
				continue
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(addr.String(), port))
		}
		return nil, fmt.Errorf("proxy target resolved to no allowed addresses")
	}
}

func isLocalhostName(host string) bool {
	lower := strings.TrimSuffix(strings.ToLower(host), ".")
	return lower == "localhost" || strings.HasSuffix(lower, ".localhost")
}

func addrFromIP(ip net.IP) (netip.Addr, bool) {
	if v4 := ip.To4(); v4 != nil {
		return netip.AddrFrom4([4]byte{v4[0], v4[1], v4[2], v4[3]}), true
	}
	if v6 := ip.To16(); v6 != nil {
		return netip.AddrFrom16([16]byte{v6[0], v6[1], v6[2], v6[3], v6[4], v6[5], v6[6], v6[7], v6[8], v6[9], v6[10], v6[11], v6[12], v6[13], v6[14], v6[15]}), true
	}
	return netip.Addr{}, false
}

func isAllowedAddr(addr netip.Addr) bool {
	return addr.IsValid() &&
		addr.IsGlobalUnicast() &&
		!addr.IsLoopback() &&
		!addr.IsPrivate() &&
		!addr.IsLinkLocalUnicast() &&
		!addr.IsUnspecified()
}
