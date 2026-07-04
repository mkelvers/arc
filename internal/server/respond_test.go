package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAcceptsHTMLFromAcceptHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	c.Request.Header.Set("Accept", "text/html,application/xhtml+xml")

	if !acceptsHTML(c) {
		t.Fatal("acceptsHTML = false, want true")
	}
}

func TestAcceptsHTMLFromHXRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	c.Request.Header.Set("HX-Request", "true")

	if !acceptsHTML(c) {
		t.Fatal("acceptsHTML = false, want true")
	}
}

func TestAcceptsHTMLReturnsFalseForJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	c.Request.Header.Set("Accept", "application/json")

	if acceptsHTML(c) {
		t.Fatal("acceptsHTML = true, want false")
	}
}

func TestRespondHTMLOrJSONErrorReturnsHTML(t *testing.T) {
	gin.SetMode(gin.TestMode)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	c.Request.Header.Set("Accept", "text/html")

	RespondHTMLOrJSONError(c, http.StatusNotFound, "not found")

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
	if w.Body.String() != "not found" {
		t.Fatalf("body = %q, want %q", w.Body.String(), "not found")
	}
}

func TestRespondHTMLOrJSONErrorReturnsJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	c.Request.Header.Set("Accept", "application/json")

	RespondHTMLOrJSONError(c, http.StatusBadRequest, "bad request")

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), `"error":"bad request"`) {
		t.Fatalf("body = %q, want json error", w.Body.String())
	}
}
