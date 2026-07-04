package observability

import (
	"testing"
)

func TestIsLocalClientIPReturnsTrueForLoopback(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "::1"} {
		if !isLocalClientIP(ip) {
			t.Fatalf("isLocalClientIP(%q) = false, want true", ip)
		}
	}
}

func TestIsLocalClientIPReturnsFalseForExternal(t *testing.T) {
	for _, ip := range []string{"8.8.8.8", "192.168.1.1", ""} {
		if isLocalClientIP(ip) {
			t.Fatalf("isLocalClientIP(%q) = true, want false", ip)
		}
	}
}

func TestIsLocalClientIPReturnsFalseForInvalid(t *testing.T) {
	if isLocalClientIP("not-an-ip") {
		t.Fatal("isLocalClientIP('not-an-ip') = true, want false")
	}
}
