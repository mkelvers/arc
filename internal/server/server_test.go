package server

import (
	"net/http"
	"testing"
	"time"
)

func TestNewHTTPServer_TimeoutsAndAddr(t *testing.T) {
	srv := newHTTPServer(":1234", http.NewServeMux())

	if srv.Addr != ":1234" {
		t.Fatalf("Addr: got %q want %q", srv.Addr, ":1234")
	}
	if srv.ReadHeaderTimeout != 5*time.Second {
		t.Fatalf("ReadHeaderTimeout: got %s want %s", srv.ReadHeaderTimeout, 5*time.Second)
	}
	if srv.ReadTimeout != 30*time.Second {
		t.Fatalf("ReadTimeout: got %s want %s", srv.ReadTimeout, 30*time.Second)
	}
	if srv.WriteTimeout != 30*time.Second {
		t.Fatalf("WriteTimeout: got %s want %s", srv.WriteTimeout, 30*time.Second)
	}
	if srv.IdleTimeout != 2*time.Minute {
		t.Fatalf("IdleTimeout: got %s want %s", srv.IdleTimeout, 2*time.Minute)
	}
}

