package allanime

import (
	"encoding/json"
	"testing"
)

func TestFlexibleIntPreservesFractionalValue(t *testing.T) {
	var value FlexibleInt
	if err := json.Unmarshal([]byte(`24.5`), &value); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if value.String() != "24.5" {
		t.Fatalf("String() = %q, want 24.5", value.String())
	}
}
