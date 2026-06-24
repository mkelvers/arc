package templates

import (
	"bytes"
	"regexp"
	"strings"
	"testing"
)

func TestLoginTemplateTextSnapshot(t *testing.T) {
	r, err := ProvideRenderer()
	if err != nil {
		t.Fatalf("ProvideRenderer: %v", err)
	}

	var buf bytes.Buffer
	if err := r.ExecuteFragment(&buf, "login.gohtml", "content", map[string]any{}); err != nil {
		t.Fatalf("ExecuteFragment: %v", err)
	}

	got := visibleTextSnapshot(buf.String())
	const want = "Sign in to your account\nEmail address\nPassword\nSign In"
	if got != want {
		t.Fatalf("login text snapshot mismatch\n got: %q\nwant: %q", got, want)
	}
}

func visibleTextSnapshot(html string) string {
	tags := regexp.MustCompile(`<[^>]+>`)
	spaces := regexp.MustCompile(`[ \t]+`)
	blankLines := regexp.MustCompile(`\n+`)

	text := tags.ReplaceAllString(html, "\n")
	text = spaces.ReplaceAllString(text, " ")
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(line)
	}
	text = strings.Join(lines, "\n")
	text = blankLines.ReplaceAllString(text, "\n")
	return strings.TrimSpace(text)
}
