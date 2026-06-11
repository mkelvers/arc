package observability

import "context"

// Small helpers to keep logging consistent and low-friction across the codebase.

func Info(event string, component string, message string, fields map[string]any) {
	LogJSON(LogLevelInfo, event, component, message, fields, nil)
}

func Warn(event string, component string, message string, fields map[string]any, err error) {
	LogJSON(LogLevelWarn, event, component, message, fields, err)
}

func WarnContext(ctx context.Context, event string, component string, message string, fields map[string]any, err error) {
	LogContext(ctx, LogLevelWarn, event, component, message, fields, err)
}

func Error(event string, component string, message string, fields map[string]any, err error) {
	LogJSON(LogLevelError, event, component, message, fields, err)
}

func ErrorContext(ctx context.Context, event string, component string, message string, fields map[string]any, err error) {
	LogContext(ctx, LogLevelError, event, component, message, fields, err)
}
