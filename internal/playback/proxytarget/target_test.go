package proxytarget

import (
	"context"
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestValidateAllowsHTTPSTargetWithHostname(t *testing.T) {
	if err := Validate("https://cdn.example.test/video/segment.ts"); err != nil {
		t.Fatalf("Validate() error = %v, want nil", err)
	}
}

func TestValidateRejectsUnsafeTargets(t *testing.T) {
	tests := []string{
		"ftp://cdn.example.test/video.ts",
		"https:///video.ts",
		"http://localhost/video.ts",
		"http://127.0.0.1/video.ts",
		"http://[::ffff:127.0.0.1]/video.ts",
		"http://169.254.169.254/video.ts",
		"https://[::1]/subtitle.vtt",
	}

	for _, targetURL := range tests {
		t.Run(targetURL, func(t *testing.T) {
			if err := Validate(targetURL); err == nil {
				t.Fatal("Validate() error = nil, want error")
			}
		})
	}
}

func TestCheckRedirectRejectsUnsafeLocation(t *testing.T) {
	req := &http.Request{URL: &url.URL{Scheme: "http", Host: "127.0.0.1", Path: "/video.ts"}}

	if err := checkRedirect(req, nil); err == nil {
		t.Fatal("checkRedirect() error = nil, want error")
	}
}

func TestValidatingDialContextRejectsPrivateResolvedAddress(t *testing.T) {
	dial := validatingDialContext(&net.Dialer{Timeout: time.Millisecond}, fakeResolver{
		ips: []net.IPAddr{{IP: net.ParseIP("192.168.1.20")}},
	})

	_, err := dial(context.Background(), "tcp", "cdn.example.test:443")
	if err == nil {
		t.Fatal("dial error = nil, want error")
	}
	if !strings.Contains(err.Error(), "no allowed addresses") {
		t.Fatalf("dial error = %v, want no allowed addresses", err)
	}
}

type fakeResolver struct {
	ips []net.IPAddr
	err error
}

func (r fakeResolver) LookupIPAddr(context.Context, string) ([]net.IPAddr, error) {
	return r.ips, r.err
}
