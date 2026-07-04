package observability

import (
	"testing"
)

func TestFormatDurationMillisFormatsFloat(t *testing.T) {
	if got := formatDurationMillis(123.456); got != "123.456ms" {
		t.Fatalf("got %q, want %q", got, "123.456ms")
	}
}

func TestFormatDurationMillisFormatsInt(t *testing.T) {
	if got := formatDurationMillis(42); got != "42ms" {
		t.Fatalf("got %q, want %q", got, "42ms")
	}
}

func TestFormatDurationMillisReturnsStringAsIs(t *testing.T) {
	if got := formatDurationMillis("fast"); got != "fast" {
		t.Fatalf("got %q, want %q", got, "fast")
	}
}
