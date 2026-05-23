package observability

import (
	"encoding/json"
	"log"
	"time"
)

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

func LogJSON(level LogLevel, event string, component string, message string, fields map[string]any, err error) {
	errorValue := ""
	if err != nil {
		errorValue = err.Error()
	}

	entry := LogEvent{
		TS:        time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Event:     event,
		Message:   message,
		Fields:    fields,
		Error:     errorValue,
		Component: component,
	}

	// Best-effort. If encoding fails, fall back to a minimal line.
	bytes, marshalErr := json.Marshal(entry)
	if marshalErr != nil {
		log.Printf("level=%s event=%s component=%s error=%q", level, event, component, marshalErr.Error())
		return
	}

	log.Print(string(bytes))
}
