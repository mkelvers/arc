package observability

import (
	"strings"
	"testing"
)

func TestFormatLogEntryFormatsHTTPRequestCompactly(t *testing.T) {
	line := formatLogEntry(LogEvent{
		TS:    "2026-06-11T12:57:39.557972Z",
		Level: LogLevelInfo,
		Event: "http_request",
		Fields: map[string]any{
			"bytes":       56198,
			"client_ip":   "127.0.0.1",
			"duration_ms": 9.419,
			"method":      "GET",
			"path":        "/api/catalog/top-pick",
			"status":      200,
		},
	})

	checks := []string{
		"2026-06-11T12:57:39.557972Z INFO http 200 GET /api/catalog/top-pick 9.419ms 54.9KB",
	}

	for _, check := range checks {
		if !strings.Contains(line, check) {
			t.Fatalf("line %q missing %q", line, check)
		}
	}

	if strings.Contains(line, "client_ip=") {
		t.Fatalf("line should omit loopback ip: %q", line)
	}
}

func TestFormatHTTPStatusColorsByStatusFamily(t *testing.T) {
	previousColorLogs := colorLogs
	colorLogs = true
	t.Cleanup(func() {
		colorLogs = previousColorLogs
	})

	tests := map[any]string{
		101:       ansiStatusBlue + "101" + ansiReset,
		200:       ansiGreen + "200" + ansiReset,
		302:       ansiYellow + "302" + ansiReset,
		404:       ansiOrange + "404" + ansiReset,
		500:       ansiRed + "500" + ansiReset,
		"unknown": "unknown",
	}

	for input, want := range tests {
		got := formatHTTPStatus(input)
		if got != want {
			t.Fatalf("formatHTTPStatus(%v) = %q, want %q", input, got, want)
		}
	}
}
