package observability

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"go.uber.org/fx/fxevent"
)

func TestDescribeFXEventErrorDescribesFailedBuildEvents(t *testing.T) {
	err := errors.New("fx failed")

	tests := map[string]struct {
		event      fxevent.Event
		wantName   string
		wantFields map[string]any
	}{
		"provided": {
			event:      &fxevent.Provided{ConstructorName: "newServer", Err: err},
			wantName:   "fx_provide_failed",
			wantFields: map[string]any{"constructor": "newServer"},
		},
		"invoked": {
			event:      &fxevent.Invoked{FunctionName: "startServer", Err: err},
			wantName:   "fx_invoke_failed",
			wantFields: map[string]any{"function": "startServer"},
		},
		"run": {
			event:      &fxevent.Run{Name: "newRepo", Kind: "provide", Err: err},
			wantName:   "fx_run_failed",
			wantFields: map[string]any{"function": "newRepo", "kind": "provide"},
		},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			assertFXEventError(t, tt.event, tt.wantName, tt.wantFields, err)
		})
	}
}

func TestDescribeFXEventErrorDescribesFailedLifecycleEvents(t *testing.T) {
	err := errors.New("fx failed")
	runtime := 12 * time.Millisecond

	tests := map[string]struct {
		event      fxevent.Event
		wantName   string
		wantFields map[string]any
	}{
		"on start executed": {
			event:      &fxevent.OnStartExecuted{CallerName: "server", FunctionName: "listen", Runtime: runtime, Err: err},
			wantName:   "fx_on_start_failed",
			wantFields: map[string]any{"caller": "server", "function": "listen", "runtime": runtime},
		},
		"on stop executed": {
			event:      &fxevent.OnStopExecuted{CallerName: "server", FunctionName: "close", Runtime: runtime, Err: err},
			wantName:   "fx_on_stop_failed",
			wantFields: map[string]any{"caller": "server", "function": "close", "runtime": runtime},
		},
		"started": {
			event:    &fxevent.Started{Err: err},
			wantName: "fx_start_failed",
		},
		"stopped": {
			event:    &fxevent.Stopped{Err: err},
			wantName: "fx_stop_failed",
		},
		"rolling back": {
			event:    &fxevent.RollingBack{StartErr: err},
			wantName: "fx_rollback_start",
		},
		"rolled back": {
			event:    &fxevent.RolledBack{Err: err},
			wantName: "fx_rollback_failed",
		},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			assertFXEventError(t, tt.event, tt.wantName, tt.wantFields, err)
		})
	}
}

func assertFXEventError(t *testing.T, event fxevent.Event, wantName string, wantFields map[string]any, wantErr error) {
	t.Helper()

	gotName, gotFields, gotErr := describeFXEventError(event)

	if gotName != wantName {
		t.Fatalf("event name = %q, want %q", gotName, wantName)
	}
	if !reflect.DeepEqual(gotFields, wantFields) {
		t.Fatalf("fields = %#v, want %#v", gotFields, wantFields)
	}
	if !errors.Is(gotErr, wantErr) {
		t.Fatalf("error = %v, want %v", gotErr, wantErr)
	}
}

func TestDescribeFXEventErrorIgnoresEventsWithoutErrors(t *testing.T) {
	tests := map[string]fxevent.Event{
		"provided": &fxevent.Provided{ConstructorName: "newServer"},
		"unknown":  &fxevent.Supplied{},
	}

	for name, event := range tests {
		t.Run(name, func(t *testing.T) {
			_, _, gotErr := describeFXEventError(event)

			if gotErr != nil {
				t.Fatalf("error = %v, want nil", gotErr)
			}
		})
	}
}
