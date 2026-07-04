package observability

import (
	"testing"
)

func TestFormatBytesBelow1KB(t *testing.T) {
	if got := formatBytes(512.0); got != "512B" {
		t.Fatalf("got %q, want %q", got, "512B")
	}
}

func TestFormatBytesInKB(t *testing.T) {
	if got := formatBytes(2048.0); got != "2.0KB" {
		t.Fatalf("got %q, want %q", got, "2.0KB")
	}
}

func TestFormatBytesInMB(t *testing.T) {
	if got := formatBytes(5_242_880.0); got != "5.0MB" {
		t.Fatalf("got %q, want %q", got, "5.0MB")
	}
}

func TestFormatBytesReturnsStringAsIs(t *testing.T) {
	if got := formatBytes("unknown"); got != "unknown" {
		t.Fatalf("got %q, want %q", got, "unknown")
	}
}
