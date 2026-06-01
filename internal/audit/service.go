// Package audit provides audit logging for user actions.
package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"mal/internal/db"
	"mal/internal/domain"
	"mal/internal/observability"
	"strings"

	"github.com/google/uuid"
)

type auditService struct {
	queries *db.Queries
}

func NewAuditService(queries *db.Queries) domain.AuditService {
	return &auditService{queries: queries}
}

func (s *auditService) Record(ctx context.Context, event domain.AuditEvent) error {
	if s == nil || s.queries == nil {
		return errors.New("audit service not configured")
	}
	action := strings.TrimSpace(event.Action)
	if action == "" {
		return errors.New("audit action missing")
	}

	ip, userAgent := RequestInfoFromContext(ctx)
	if strings.TrimSpace(event.IP) != "" {
		ip = event.IP
	}
	if strings.TrimSpace(event.UserAgent) != "" {
		userAgent = event.UserAgent
	}

	metadataJSON := event.MetadataJSON
	if len(metadataJSON) == 0 {
		metadataJSON = json.RawMessage("null")
	}

	_, err := s.queries.CreateAuditLog(ctx, db.CreateAuditLogParams{
		ID:           uuid.New().String(),
		UserID:       sql.NullString{String: strings.TrimSpace(event.UserID), Valid: strings.TrimSpace(event.UserID) != ""},
		Action:       action,
		ResourceType: sql.NullString{String: strings.TrimSpace(event.ResourceType), Valid: strings.TrimSpace(event.ResourceType) != ""},
		ResourceID:   sql.NullString{String: strings.TrimSpace(event.ResourceID), Valid: strings.TrimSpace(event.ResourceID) != ""},
		Ip:           sql.NullString{String: strings.TrimSpace(ip), Valid: strings.TrimSpace(ip) != ""},
		UserAgent:    sql.NullString{String: strings.TrimSpace(userAgent), Valid: strings.TrimSpace(userAgent) != ""},
		MetadataJson: sql.NullString{String: string(metadataJSON), Valid: true},
	})
	if err != nil {
		return err
	}

	observability.Info(
		"audit",
		"audit",
		action,
		map[string]any{
			"user_id":       event.UserID,
			"resource_type": event.ResourceType,
			"resource_id":   event.ResourceID,
		},
	)

	return nil
}
