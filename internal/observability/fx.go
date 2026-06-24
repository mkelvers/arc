package observability

import (
	"go.uber.org/fx/fxevent"
)

type fxLogger struct{}

func NewFxLogger() fxevent.Logger {
	return fxLogger{}
}

func (fxLogger) LogEvent(event fxevent.Event) {
	eventName, fields, err := describeFXEventError(event)
	if err == nil {
		return
	}

	Error(eventName, "fx", "", fields, err)
}

func describeFXEventError(event fxevent.Event) (string, map[string]any, error) {
	switch e := event.(type) {
	case *fxevent.Provided:
		return "fx_provide_failed", map[string]any{"constructor": e.ConstructorName}, e.Err
	case *fxevent.Invoked:
		return "fx_invoke_failed", map[string]any{"function": e.FunctionName}, e.Err
	case *fxevent.Run:
		return "fx_run_failed", map[string]any{"function": e.Name, "kind": e.Kind}, e.Err
	case *fxevent.OnStartExecuted:
		return "fx_on_start_failed", map[string]any{"caller": e.CallerName, "function": e.FunctionName, "runtime": e.Runtime}, e.Err
	case *fxevent.OnStopExecuted:
		return "fx_on_stop_failed", map[string]any{"caller": e.CallerName, "function": e.FunctionName, "runtime": e.Runtime}, e.Err
	case *fxevent.Started:
		return "fx_start_failed", nil, e.Err
	case *fxevent.Stopped:
		return "fx_stop_failed", nil, e.Err
	case *fxevent.RollingBack:
		return "fx_rollback_start", nil, e.StartErr
	case *fxevent.RolledBack:
		return "fx_rollback_failed", nil, e.Err
	default:
		return "", nil, nil
	}
}
