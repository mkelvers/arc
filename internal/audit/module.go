package audit

import (
	"mal/internal/audit/service"

	"go.uber.org/fx"
)

var Module = fx.Options(
	fx.Provide(service.NewAuditService),
)
