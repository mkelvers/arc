package observability

import (
	"testing"
)

func TestQuoteIfNeededReturnsEmptyQuoted(t *testing.T) {
	if got := quoteIfNeeded(""); got != `""` {
		t.Fatalf("got %q, want %q", got, `""`)
	}
}

func TestQuoteIfNeededReturnsPlainString(t *testing.T) {
	if got := quoteIfNeeded("hello"); got != "hello" {
		t.Fatalf("got %q, want %q", got, "hello")
	}
}

func TestQuoteIfNeededQuotesStringWithEquals(t *testing.T) {
	got := quoteIfNeeded("key=value")
	if got != `"key=value"` {
		t.Fatalf("got %q, want %q", got, `"key=value"`)
	}
}

func TestQuoteIfNeededQuotesStringWithSpace(t *testing.T) {
	got := quoteIfNeeded("hello world")
	if got != `"hello world"` {
		t.Fatalf("got %q, want %q", got, `"hello world"`)
	}
}

func TestQuoteIfNeededQuotesStringWithNewline(t *testing.T) {
	got := quoteIfNeeded("line1\nline2")
	if got != `"line1\nline2"` {
		t.Fatalf("got %q, want %q", got, `"line1\nline2"`)
	}
}
