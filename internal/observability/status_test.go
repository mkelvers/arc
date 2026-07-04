package observability

import (
	"testing"
)

func TestFormatHTTPStatusReturnsPlainWhenNoColor(t *testing.T) {
	colorLogs = false
	if got := formatHTTPStatus(200); got != "200" {
		t.Fatalf("got %q, want %q", got, "200")
	}
}

func TestFormatHTTPStatusReturnsFallback(t *testing.T) {
	colorLogs = false
	if got := formatHTTPStatus("ok"); got != "ok" {
		t.Fatalf("got %q, want %q", got, "ok")
	}
}
