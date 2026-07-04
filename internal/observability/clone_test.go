package observability

import (
	"testing"
)

func TestCloneFieldsReturnsNilForNil(t *testing.T) {
	if got := cloneFields(nil); got != nil {
		t.Fatalf("expected nil, got %#v", got)
	}
}

func TestCloneFieldsReturnsNilForEmpty(t *testing.T) {
	if got := cloneFields(map[string]any{}); got != nil {
		t.Fatalf("expected nil, got %#v", got)
	}
}

func TestCloneFieldsCopiesAllEntries(t *testing.T) {
	original := map[string]any{"a": 1, "b": "two"}
	cp := cloneFields(original)
	if cp["a"] != 1 || cp["b"] != "two" {
		t.Fatalf("clone = %#v, want %#v", cp, original)
	}
	cp["c"] = 3
	if _, exists := original["c"]; exists {
		t.Fatal("clone modified original")
	}
}
