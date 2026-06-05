package templates

import "testing"

func TestProvideRendererParsesTemplates(t *testing.T) {
	if _, err := ProvideRenderer(); err != nil {
		t.Fatalf("parse templates: %v", err)
	}
}
