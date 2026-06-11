// Package observability provides logging and metrics instrumentation.
package observability

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	ansiReset  = "\x1b[0m"
	ansiBlue   = "\x1b[36m"
	ansiYellow = "\x1b[33m"
	ansiRed    = "\x1b[31m"
)

var colorLogs = shouldColorLogs()

type LogLevel string

const (
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

type LogEvent struct {
	TS        string         `json:"ts"`
	Level     LogLevel       `json:"level"`
	Event     string         `json:"event"`
	Message   string         `json:"message,omitempty"`
	Fields    map[string]any `json:"fields,omitempty"`
	Error     string         `json:"error,omitempty"`
	Component string         `json:"component,omitempty"`
}

func init() {
	log.SetFlags(0)
}

func LogJSON(level LogLevel, event string, component string, message string, fields map[string]any, err error) {
	LogContext(context.TODO(), level, event, component, message, fields, err)
}

func LogContext(ctx context.Context, level LogLevel, event string, component string, message string, fields map[string]any, err error) {
	fields = enrichFields(level, fields, err)
	fields = enrichRequestFields(ctx, fields)

	entry := LogEvent{
		TS:        time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Event:     event,
		Message:   message,
		Fields:    fields,
		Component: component,
	}

	if err != nil {
		entry.Error = err.Error()
	}

	log.Print(formatLogEntry(entry))
}

func enrichRequestFields(ctx context.Context, fields map[string]any) map[string]any {
	requestContext, ok := RequestContextFromContext(ctx)
	if !ok {
		return fields
	}

	enriched := cloneFields(fields)
	if enriched == nil {
		enriched = make(map[string]any, 3)
	}

	if requestContext.ID != "" {
		if _, exists := enriched["request_id"]; !exists {
			enriched["request_id"] = requestContext.ID
		}
	}
	if requestContext.Path != "" {
		if _, exists := enriched["request_path"]; !exists {
			enriched["request_path"] = requestContext.Path
		}
	}
	if requestContext.Route != "" && requestContext.Route != requestContext.Path {
		if _, exists := enriched["request_route"]; !exists {
			enriched["request_route"] = requestContext.Route
		}
	}

	return enriched
}

func enrichFields(level LogLevel, fields map[string]any, err error) map[string]any {
	if level == LogLevelInfo {
		return fields
	}

	enriched := cloneFields(fields)
	if enriched == nil {
		enriched = make(map[string]any, 3)
	}

	if _, exists := enriched["source"]; !exists {
		if source := callerSource(); source != "" {
			enriched["source"] = source
		}
	}

	if err != nil {
		if _, exists := enriched["error_type"]; !exists {
			if errorType := formatErrorType(err); errorType != "" {
				enriched["error_type"] = errorType
			}
		}
		if _, exists := enriched["error_chain"]; !exists {
			if chain := formatErrorChain(err); chain != "" {
				enriched["error_chain"] = chain
			}
		}
	}

	return enriched
}

func callerSource() string {
	pcs := make([]uintptr, 8)
	n := runtime.Callers(3, pcs)
	frames := runtime.CallersFrames(pcs[:n])

	for {
		frame, more := frames.Next()
		if !strings.Contains(frame.File, "/internal/observability/") {
			return filepath.Base(frame.File) + ":" + strconv.Itoa(frame.Line)
		}
		if !more {
			return ""
		}
	}
}

func formatErrorType(err error) string {
	errType := reflect.TypeOf(err)
	if errType == nil {
		return ""
	}

	return errType.String()
}

func formatErrorChain(err error) string {
	parts := make([]string, 0, 4)
	for current := err; current != nil; current = errors.Unwrap(current) {
		parts = append(parts, current.Error())
		if len(parts) == 4 {
			break
		}
	}

	if len(parts) <= 1 {
		return ""
	}

	return strings.Join(parts, " -> ")
}

func formatLogEntry(entry LogEvent) string {
	if entry.Event == "http_request" {
		return formatHTTPRequestLog(entry)
	}

	parts := []string{entry.TS, formatLogLevel(entry.Level), entry.Event}

	if entry.Component != "" {
		parts = append(parts, "component="+entry.Component)
	}

	if entry.Message != "" {
		parts = append(parts, quoteIfNeeded(entry.Message))
	}

	if len(entry.Fields) > 0 {
		keys := make([]string, 0, len(entry.Fields))
		for key := range entry.Fields {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		for _, key := range keys {
			parts = append(parts, key+"="+formatFieldValue(entry.Fields[key]))
		}
	}

	if entry.Error != "" {
		parts = append(parts, "error="+quoteIfNeeded(entry.Error))
	}

	return strings.Join(parts, " ")
}

func formatHTTPRequestLog(entry LogEvent) string {
	fields := cloneFields(entry.Fields)
	status := popField(fields, "status")
	method := popField(fields, "method")
	path := popField(fields, "path")
	duration := popField(fields, "duration_ms")
	bytes := popField(fields, "bytes")
	route := popField(fields, "route")
	query := popField(fields, "query")
	clientIP := popField(fields, "client_ip")

	parts := []string{entry.TS, formatLogLevel(entry.Level), "http"}
	if status != "" {
		parts = append(parts, status)
	}
	if method != "" || path != "" {
		parts = append(parts, strings.TrimSpace(method+" "+path))
	}
	if duration != "" {
		parts = append(parts, duration)
	}
	if bytes != "" {
		parts = append(parts, bytes)
	}
	if route != "" {
		parts = append(parts, "route="+route)
	}
	if query != "" {
		parts = append(parts, "query="+quoteIfNeeded(query))
	}
	if clientIP != "" && !isLocalClientIP(clientIP) {
		parts = append(parts, "ip="+clientIP)
	}
	appendSortedFields(&parts, fields)

	if entry.Error != "" {
		parts = append(parts, "error="+quoteIfNeeded(entry.Error))
	}

	return strings.Join(parts, " ")
}

func appendSortedFields(parts *[]string, fields map[string]any) {
	if len(fields) == 0 {
		return
	}

	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, key := range keys {
		*parts = append(*parts, key+"="+formatFieldValue(fields[key]))
	}
}

func cloneFields(fields map[string]any) map[string]any {
	if len(fields) == 0 {
		return nil
	}

	copyFields := make(map[string]any, len(fields))
	for key, value := range fields {
		copyFields[key] = value
	}

	return copyFields
}

func popField(fields map[string]any, key string) string {
	if len(fields) == 0 {
		return ""
	}

	value, ok := fields[key]
	if !ok {
		return ""
	}
	delete(fields, key)

	return formatInlineField(key, value)
}

func formatInlineField(key string, value any) string {
	switch key {
	case "status":
		return fmt.Sprint(value)
	case "duration_ms":
		return formatDurationMillis(value)
	case "bytes":
		return formatBytes(value)
	default:
		if text, ok := value.(string); ok {
			return text
		}
		return fmt.Sprint(value)
	}
}

func formatDurationMillis(value any) string {
	ms, ok := toFloat64(value)
	if !ok {
		return fmt.Sprint(value)
	}

	return strconv.FormatFloat(ms, 'f', -1, 64) + "ms"
}

func formatBytes(value any) string {
	bytesValue, ok := toFloat64(value)
	if !ok {
		return fmt.Sprint(value)
	}

	if bytesValue < 1024 {
		return strconv.FormatFloat(bytesValue, 'f', -1, 64) + "B"
	}
	if bytesValue < 1024*1024 {
		return strconv.FormatFloat(bytesValue/1024, 'f', 1, 64) + "KB"
	}

	return strconv.FormatFloat(bytesValue/(1024*1024), 'f', 1, 64) + "MB"
}

func toFloat64(value any) (float64, bool) {
	switch v := value.(type) {
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case float32:
		return float64(v), true
	case float64:
		return v, true
	default:
		return 0, false
	}
}

func isLocalClientIP(value string) bool {
	parsed := net.ParseIP(value)
	if parsed == nil {
		return false
	}

	return parsed.IsLoopback()
}

func formatLogLevel(level LogLevel) string {
	if colorLogs {
		switch level {
		case LogLevelWarn:
			return ansiYellow + "WARN" + ansiReset
		case LogLevelError:
			return ansiRed + "ERROR" + ansiReset
		default:
			return ansiBlue + "INFO" + ansiReset
		}
	}

	switch level {
	case LogLevelWarn:
		return "WARN"
	case LogLevelError:
		return "ERROR"
	default:
		return "INFO"
	}
}

func shouldColorLogs() bool {
	if strings.TrimSpace(os.Getenv("NO_COLOR")) != "" {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("TERM")), "dumb") {
		return false
	}

	info, err := os.Stderr.Stat()
	if err != nil {
		return false
	}

	return info.Mode()&os.ModeCharDevice != 0
}

func formatFieldValue(value any) string {
	switch v := value.(type) {
	case string:
		return quoteIfNeeded(v)
	case time.Duration:
		return v.String()
	case float32:
		return strconv.FormatFloat(float64(v), 'f', -1, 32)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case fmt.Stringer:
		return quoteIfNeeded(v.String())
	default:
		return quoteIfNeeded(fmt.Sprint(value))
	}
}

func quoteIfNeeded(value string) string {
	if value == "" {
		return `""`
	}

	for _, r := range value {
		if r == '=' || r == ' ' || r == '\t' || r == '\n' || r == '"' {
			return strconv.Quote(value)
		}
	}

	return value
}
