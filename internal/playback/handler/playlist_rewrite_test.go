package handler

import (
	"context"
	"fmt"
	"mal/internal/domain"
	"strings"
	"testing"
)

type rewritePlaybackService struct {
	targets []string
}

func (s *rewritePlaybackService) BuildWatchData(context.Context, int, []string, string, string, string) (domain.WatchPageData, error) {
	return domain.WatchPageData{}, nil
}

func (s *rewritePlaybackService) SaveProgress(context.Context, string, int64, int, float64) error {
	return nil
}

func (s *rewritePlaybackService) CompleteAnime(context.Context, string, int64) error {
	return nil
}

func (s *rewritePlaybackService) SignProxyToken(targetURL, _ string, _ string) (string, error) {
	s.targets = append(s.targets, targetURL)
	return fmt.Sprintf("token-%d", len(s.targets)), nil
}

func (s *rewritePlaybackService) ResolveProxyToken(string, string) (string, string, error) {
	return "", "", nil
}

func (s *rewritePlaybackService) UpsertSkipSegmentOverride(context.Context, string, int64, int, string, float64, float64) error {
	return nil
}

func TestRewriteHLSPlaylistProxiesSegmentAndKeyURIs(t *testing.T) {
	svc := &rewritePlaybackService{}
	h := &PlaybackHandler{svc: svc}

	body := strings.Join([]string{
		"#EXTM3U",
		`#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"`,
		"#EXTINF:4.0,",
		"segments/seg-1.ts",
		"#EXTINF:4.0,",
		"https://cdn.example.test/video/seg-2.ts",
		"",
	}, "\n")

	got, err := h.rewriteHLSPlaylist(body, "https://origin.example.test/hls/master/index.m3u8", "https://referer.example.test")
	if err != nil {
		t.Fatalf("rewriteHLSPlaylist returned error: %v", err)
	}

	if strings.Contains(got, "origin.example.test") || strings.Contains(got, "cdn.example.test") || strings.Contains(got, "keys/key.bin") || strings.Contains(got, "segments/seg-1.ts") {
		t.Fatalf("rewritten playlist leaked upstream data:\n%s", got)
	}

	for _, token := range []string{"token-1", "token-2", "token-3"} {
		if !strings.Contains(got, "/watch/proxy/stream?token="+token) {
			t.Fatalf("rewritten playlist missing %s:\n%s", token, got)
		}
	}

	wantTargets := []string{
		"https://origin.example.test/hls/master/keys/key.bin",
		"https://origin.example.test/hls/master/segments/seg-1.ts",
		"https://cdn.example.test/video/seg-2.ts",
	}
	if strings.Join(svc.targets, "\n") != strings.Join(wantTargets, "\n") {
		t.Fatalf("targets = %#v, want %#v", svc.targets, wantTargets)
	}
}

func TestIsHLSPlaylistResponse(t *testing.T) {
	if !isHLSPlaylistResponse("https://example.test/master.m3u8?token=abc", nil) {
		t.Fatal("expected .m3u8 URL to be treated as playlist")
	}
}
