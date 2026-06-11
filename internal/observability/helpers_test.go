package observability

import (
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestWarnEnrichesSourceAndErrorContext(t *testing.T) {
	fields := enrichFields(LogLevelWarn, map[string]any{"anime_id": 123}, wrappedError())

	if fields["anime_id"] != 123 {
		t.Fatalf("expected existing field to survive, got %#v", fields["anime_id"])
	}

	source, ok := fields["source"].(string)
	if !ok || source == "" {
		t.Fatalf("expected source field, got %#v", fields["source"])
	}

	errorType, ok := fields["error_type"].(string)
	if !ok || errorType == "" {
		t.Fatalf("expected error_type field, got %#v", fields["error_type"])
	}

	chain, ok := fields["error_chain"].(string)
	if !ok || !strings.Contains(chain, "query anime") || !strings.Contains(chain, "db timeout") {
		t.Fatalf("expected wrapped error chain, got %#v", fields["error_chain"])
	}
}

func wrappedError() error {
	return fmt.Errorf("query anime: %w", errors.New("db timeout"))
}
