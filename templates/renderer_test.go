package templates

import (
	"bytes"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProvideRendererParsesTemplates(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatalf("parse templates: %v", err)
	}
	if len(r.templates) == 0 {
		t.Fatal("expected at least one parsed template")
	}
}

func TestInstanceReturnsHTMLRender(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("index.gohtml", map[string]any{"key": "val"})
	hr, ok := render.(HTMLRender)
	if !ok {
		t.Fatalf("expected HTMLRender, got %T", render)
	}
	if hr.Name != "index.gohtml" {
		t.Errorf("expected index.gohtml, got %s", hr.Name)
	}
}

func TestRenderValidTemplate(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("index.gohtml", map[string]any{
		"User": false,
	})
	w := httptest.NewRecorder()
	if err := render.Render(w); err != nil {
		t.Fatalf("Render error: %v", err)
	}
	if !strings.Contains(w.Body.String(), "<!DOCTYPE html>") {
		t.Error("expected HTML doctype in output")
	}
}

func TestRenderInvalidTemplate(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("nonexistent.gohtml", nil)
	w := httptest.NewRecorder()
	if err := render.Render(w); err == nil {
		t.Fatal("expected error for nonexistent template")
	}
}

func TestRenderWithFragment(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("index.gohtml", map[string]any{
		"_fragment": "content",
		"User":      false,
	})
	w := httptest.NewRecorder()
	if err := render.Render(w); err != nil {
		t.Fatalf("Render error: %v", err)
	}
	if !strings.Contains(w.Body.String(), "Currently Airing") {
		t.Error("expected content block in fragment render")
	}
}

func TestRenderWithNonStringFragment(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	render := r.Instance("index.gohtml", map[string]any{
		"_fragment": 42,
	})
	w := httptest.NewRecorder()
	if err := render.Render(w); err != nil {
		t.Fatalf("Render error: %v", err)
	}
	// non-string fragment should fall through to default template rendering
	if !strings.Contains(w.Body.String(), "<!DOCTYPE html>") {
		t.Error("expected HTML output for non-string fragment fallthrough")
	}
}

func TestExecuteFragmentValid(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "index.gohtml", "content", map[string]any{
		"User": false,
	})
	if err != nil {
		t.Fatalf("ExecuteFragment error: %v", err)
	}
	if !strings.Contains(buf.String(), "Currently Airing") {
		t.Error("expected content in fragment output")
	}
}

func TestExecuteFragmentInvalidTemplate(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	err = r.ExecuteFragment(&buf, "missing.gohtml", "content", nil)
	if err == nil {
		t.Fatal("expected error for missing template")
	}
}
