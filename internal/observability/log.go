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
		// Keep output JSON-only even on failures by constructing a minimal entry.
		// Marshal individual strings to ensure proper escaping.
		tsBytes, _ := json.Marshal(time.Now().UTC().Format(time.RFC3339Nano))
		levelBytes, _ := json.Marshal(level)
		eventBytes, _ := json.Marshal("log_marshal_failed")
		componentBytes, _ := json.Marshal(component)
		errBytes, _ := json.Marshal(marshalErr.Error())
		log.Printf(`{"ts":%s,"level":%s,"event":%s,"component":%s,"error":%s}`, tsBytes, levelBytes, eventBytes, componentBytes, errBytes)
		return
	}

	log.Print(string(bytes))
}
