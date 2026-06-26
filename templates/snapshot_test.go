package templates

import (
	"bytes"
	"strings"
	"testing"
)

func TestLoginTemplateShowsCoreCopy(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatalf("ProvideRenderer: %v", err)
	}

	var buf bytes.Buffer
	if err := r.ExecuteFragment(&buf, "login.gohtml", "content", map[string]any{}); err != nil {
		t.Fatalf("ExecuteFragment: %v", err)
	}

	body := buf.String()
	for _, want := range []string{
		"Sign in to your account",
		"Email address",
		"Password",
		"Sign In",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("login template missing %q in output:\n%s", want, body)
		}
	}
}

func TestNotFoundTemplateShowsCoreCopy(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatalf("ProvideRenderer: %v", err)
	}

	var buf bytes.Buffer
	if err := r.ExecuteFragment(&buf, "not_found.gohtml", "content", map[string]any{}); err != nil {
		t.Fatalf("ExecuteFragment: %v", err)
	}

	body := buf.String()
	for _, want := range []string{
		"You got a little lost",
		"This page slipped off the map for a minute",
		"Head back home",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("not found template missing %q in output:\n%s", want, body)
		}
	}
}
