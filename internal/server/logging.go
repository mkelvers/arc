package server

import (
	"context"
	"io"
	"log/slog"
	"sort"
)

type requestContextLogHandler struct {
	handler slog.Handler
}

func NewLogHandler(w io.Writer) slog.Handler {
	return requestContextLogHandler{
		handler: slog.NewTextHandler(w, &slog.HandlerOptions{AddSource: true}),
	}
}

func (h requestContextLogHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.handler.Enabled(ctx, level)
}

func (h requestContextLogHandler) Handle(ctx context.Context, record slog.Record) error {
	record = flattenFields(record)
	if requestContext, ok := RequestContextFromContext(ctx); ok {
		if requestContext.ID != "" && !hasAttr(record, "request_id") {
			record.AddAttrs(slog.String("request_id", requestContext.ID))
		}
		if requestContext.Path != "" && !hasAttr(record, "request_path") {
			record.AddAttrs(slog.String("request_path", requestContext.Path))
		}
		if requestContext.Route != "" && requestContext.Route != requestContext.Path && !hasAttr(record, "request_route") {
			record.AddAttrs(slog.String("request_route", requestContext.Route))
		}
	}

	return h.handler.Handle(ctx, record)
}

func (h requestContextLogHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return requestContextLogHandler{handler: h.handler.WithAttrs(attrs)}
}

func (h requestContextLogHandler) WithGroup(name string) slog.Handler {
	return requestContextLogHandler{handler: h.handler.WithGroup(name)}
}

func flattenFields(record slog.Record) slog.Record {
	flattened := slog.NewRecord(record.Time, record.Level, record.Message, record.PC)
	record.Attrs(func(attr slog.Attr) bool {
		if attr.Key == "fields" {
			if fields, ok := attr.Value.Any().(map[string]any); ok {
				keys := make([]string, 0, len(fields))
				for key := range fields {
					keys = append(keys, key)
				}
				sort.Strings(keys)

				for _, key := range keys {
					value := fields[key]
					flattened.AddAttrs(slog.Any(key, value))
				}
				return true
			}
		}

		flattened.AddAttrs(attr)
		return true
	})

	return flattened
}

func hasAttr(record slog.Record, key string) bool {
	found := false
	record.Attrs(func(attr slog.Attr) bool {
		if attr.Key == key {
			found = true
			return false
		}
		return true
	})
	return found
}
