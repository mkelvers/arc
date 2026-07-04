package observability

import (
	"testing"
)

func TestPopFieldReturnsEmptyForNil(t *testing.T) {
	if got := popField(nil, "key"); got != "" {
		t.Fatalf("got %q, want empty", got)
	}
}

func TestPopFieldReturnsEmptyForMissingKey(t *testing.T) {
	if got := popField(map[string]any{"a": 1}, "b"); got != "" {
		t.Fatalf("got %q, want empty", got)
	}
}

func TestPopFieldReturnsAndDeletes(t *testing.T) {
	m := map[string]any{"status": 200, "other": "x"}
	got := popField(m, "status")
	if got != "200" {
		t.Fatalf("got %q, want %q", got, "200")
	}
	if _, exists := m["status"]; exists {
		t.Fatal("popField did not delete key")
	}
	if m["other"] != "x" {
		t.Fatal("popField deleted other key")
	}
}

func TestPopFieldFormatsDuration(t *testing.T) {
	got := popField(map[string]any{"duration_ms": 123.4}, "duration_ms")
	if got != "123.4ms" {
		t.Fatalf("got %q, want %q", got, "123.4ms")
	}
}

func TestPopFieldFormatsBytes(t *testing.T) {
	got := popField(map[string]any{"bytes": 2048.0}, "bytes")
	if got != "2.0KB" {
		t.Fatalf("got %q, want %q", got, "2.0KB")
	}
}

func TestPopFieldPassthroughString(t *testing.T) {
	got := popField(map[string]any{"method": "GET"}, "method")
	if got != "GET" {
		t.Fatalf("got %q, want %q", got, "GET")
	}
}
