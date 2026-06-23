package transport

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestHandleStatusRetryLeavesOutputUntouched(t *testing.T) {
	out := struct {
		Data []struct {
			MalID int `json:"mal_id"`
		} `json:"data"`
	}{
		Data: []struct {
			MalID int `json:"mal_id"`
		}{{MalID: 123}},
	}
	resp := &http.Response{
		StatusCode: http.StatusNotFound,
		Body:       io.NopCloser(strings.NewReader(`{"data":[{"mal_id":999}]}`)),
		Header:     make(http.Header),
	}

	statusCode, retry, err := handleResponseRetry(context.Background(), resp, "https://example.test/anime/1", &out, 0, 1)
	if statusCode != http.StatusNotFound {
		t.Fatalf("statusCode = %d, want %d", statusCode, http.StatusNotFound)
	}
	if retry {
		t.Fatal("retry = true, want false")
	}
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("err = %v, want APIError", err)
	}
	if len(out.Data) != 1 || out.Data[0].MalID != 123 {
		t.Fatalf("out = %+v, want original value", out)
	}

	var body struct {
		Data []struct {
			MalID int `json:"mal_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(apiErr.Body, &body); err != nil {
		t.Fatalf("unmarshal APIError body: %v", err)
	}
	if len(body.Data) != 1 || body.Data[0].MalID != 999 {
		t.Fatalf("APIError body = %+v, want decoded error body", body)
	}
}
