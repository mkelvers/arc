package observability

import (
	"go.uber.org/fx/fxevent"
)

type fxLogger struct{}

func NewFxLogger() fxevent.Logger {
	return fxLogger{}
}

func (fxLogger) LogEvent(event fxevent.Event) {
	switch e := event.(type) {
	case *fxevent.Provided:
		if e.Err != nil {
			Error("fx_provide_failed", "fx", "", map[string]any{"constructor": e.ConstructorName}, e.Err)
		}
	case *fxevent.Invoked:
		if e.Err != nil {
			Error("fx_invoke_failed", "fx", "", map[string]any{"function": e.FunctionName}, e.Err)
		}
	case *fxevent.Run:
		if e.Err != nil {
			Error("fx_run_failed", "fx", "", map[string]any{"function": e.Name, "kind": e.Kind}, e.Err)
		}
	case *fxevent.OnStartExecuted:
		if e.Err != nil {
			Error("fx_on_start_failed", "fx", "", map[string]any{"caller": e.CallerName, "function": e.FunctionName, "runtime": e.Runtime}, e.Err)
		}
	case *fxevent.OnStopExecuted:
		if e.Err != nil {
			Error("fx_on_stop_failed", "fx", "", map[string]any{"caller": e.CallerName, "function": e.FunctionName, "runtime": e.Runtime}, e.Err)
		}
	case *fxevent.Started:
		if e.Err != nil {
			Error("fx_start_failed", "fx", "", nil, e.Err)
		}
	case *fxevent.Stopped:
		if e.Err != nil {
			Error("fx_stop_failed", "fx", "", nil, e.Err)
		}
	case *fxevent.RollingBack:
		if e.StartErr != nil {
			Error("fx_rollback_start", "fx", "", nil, e.StartErr)
		}
	case *fxevent.RolledBack:
		if e.Err != nil {
			Error("fx_rollback_failed", "fx", "", nil, e.Err)
		}
	}
}
