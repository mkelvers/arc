package domain

import (
	"context"
	"encoding/json"
)

type AuditEvent struct {
	UserID       string
	Action       string
	ResourceType string
	ResourceID   string
	MetadataJSON json.RawMessage
	IP           string
	UserAgent    string
}

type AuditService interface {
	Record(ctx context.Context, event AuditEvent) error
}
