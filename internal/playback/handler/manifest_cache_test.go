package handler

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type manifestRoundTripper struct {
	calls int
	body  string
}

func (rt *manifestRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	rt.calls++
	return &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type":   {"application/vnd.apple.mpegurl"},
			"Content-Length": {"48"},
		},
		Body: io.NopCloser(strings.NewReader(rt.body)),
	}, nil
}

func TestManifestCacheTTLSizeAndLRU(t *testing.T) {
	now := time.Unix(100, 0)
	cache := newManifestCache(2)
	headers := http.Header{"Content-Type": {"application/vnd.apple.mpegurl"}}
	vod := []byte("#EXTM3U\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST\n")
	live := []byte("#EXTM3U\n#EXTINF:4,\nsegment.ts\n")

	if !cache.set("vod", http.StatusOK, headers, vod, now) {
		t.Fatal("VOD manifest was not cached")
	}
	if !cache.set("live", http.StatusOK, headers, live, now) {
		t.Fatal("live manifest was not cached")
	}
	cache.get("vod", now)
	cache.set("new", http.StatusOK, headers, vod, now)

	if _, ok := cache.get("live", now); ok {
		t.Fatal("least recently used manifest was not evicted")
	}
	if _, ok := cache.get("vod", now.Add(manifestCacheLiveTTL+time.Second)); !ok {
		t.Fatal("VOD manifest expired at the live TTL")
	}
	if cache.set("large", http.StatusOK, headers, make([]byte, manifestCacheMaxBodySize+1), now) {
		t.Fatal("oversized manifest was cached")
	}
}

func TestReadBoundedPlaylistRejectsOversizedBody(t *testing.T) {
	_, err := readBoundedPlaylist(bytes.NewReader(make([]byte, manifestCacheMaxBodySize+1)))
	if err == nil {
		t.Fatal("readBoundedPlaylist accepted an oversized body")
	}
}

func TestCachedRawPlaylistIsRewrittenWithResponseTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &rewritePlaybackService{}
	h := &PlaybackHandler{svc: svc}
	body := []byte("#EXTM3U\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST\n")
	headers := http.Header{"Content-Type": {"application/vnd.apple.mpegurl"}, "Content-Length": {"48"}}

	responses := make([]string, 0, 2)
	for range 2 {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		h.writeProxyPlaylist(ctx, http.StatusOK, headers, body, "https://cdn.example.test/master.m3u8", "")
		responses = append(responses, recorder.Body.String())
		if recorder.Header().Get("Content-Length") == "48" {
			t.Fatal("rewritten playlist retained upstream Content-Length")
		}
	}

	if responses[0] == responses[1] {
		t.Fatalf("rewritten responses reused tokenized output: %q", responses[0])
	}
	if !strings.Contains(responses[0], "token=token-1") || !strings.Contains(responses[1], "token=token-2") {
		t.Fatalf("responses did not contain separately issued tokens: %#v", responses)
	}
}

func TestHandleProxyStreamServesCachedRawManifest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &rewritePlaybackService{targetURL: "https://203.0.113.10/master.m3u8"}
	rt := &manifestRoundTripper{body: "#EXTM3U\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST\n"}
	h := &PlaybackHandler{
		svc:             svc,
		streamingClient: &http.Client{Transport: rt},
		manifestCache:   newManifestCache(2),
	}
	router := gin.New()
	router.GET("/watch/proxy/stream", h.HandleProxyStream)

	responses := make([]string, 0, 2)
	for range 2 {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/watch/proxy/stream?token=opaque", nil)
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
		}
		responses = append(responses, recorder.Body.String())
	}

	if rt.calls != 1 {
		t.Fatalf("upstream calls = %d, want 1", rt.calls)
	}
	if responses[0] == responses[1] {
		t.Fatalf("cached raw manifest reused rewritten tokens: %#v", responses)
	}
}
