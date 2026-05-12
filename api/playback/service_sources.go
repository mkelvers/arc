package playback

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
)

// resolveModeSourceWithCache is like resolveModeSource but caches probe results.
func (s *Service) resolveModeSourceWithCache(
	ctx context.Context,
	showID string,
	episode string,
	mode string,
	quality string,
	probeCache map[string]directProbeResult,
	probeCacheMu *sync.Mutex,
) (StreamSource, error) {
	sources, err := s.allAnimeClient.GetEpisodeSources(ctx, showID, episode, mode)
	if err != nil {
		return StreamSource{}, err
	}

	ranked, err := rankSources(sources, quality)
	if err != nil {
		return StreamSource{}, err
	}

	selected, _, err := s.choosePlaybackSourceWithCache(ctx, ranked, probeCache, probeCacheMu)
	if err != nil {
		return StreamSource{}, err
	}

	selected.AvailableQualities = sources
	return selected, nil
}

// choosePlaybackSource selects the best playable source from ranked candidates.
// priority: direct media > probed media > embed sources > ranked fallback.
func (s *Service) choosePlaybackSource(
	ctx context.Context,
	ranked []sourceScore,
	probeFn func(context.Context, StreamSource) (bool, string),
) (StreamSource, string, error) {
	if len(ranked) == 0 {
		return StreamSource{}, "", errors.New("no ranked sources available")
	}

	embedCandidates := make([]StreamSource, 0, len(ranked))
	for _, candidate := range ranked {
		source := candidate.source
		switch strings.ToLower(source.Type) {
		case "mp4", "m3u8":
			return source, "direct-media", nil // known playable types
		case "embed":
			embedCandidates = append(embedCandidates, source) // need probing
		default:
			// probe unknown types
			if playable, contentType := probeFn(ctx, source); playable {
				return normalizeSourceTypeFromProbe(source, contentType), "probed-media", nil
			}
		}
	}

	// check embed sources for playability
	for _, embed := range embedCandidates {
		if s.probeEmbedSource(ctx, embed) {
			return embed, "embed-probed", nil
		}
	}

	// fallback to first embed or first ranked
	if len(embedCandidates) > 0 {
		return embedCandidates[0], "embed-fallback", nil
	}

	return ranked[0].source, "ranked-fallback", nil
}

// choosePlaybackSourceWithCache wraps choosePlaybackSource with cached probing.
func (s *Service) choosePlaybackSourceWithCache(
	ctx context.Context,
	ranked []sourceScore,
	probeCache map[string]directProbeResult,
	probeCacheMu *sync.Mutex,
) (StreamSource, string, error) {
	return s.choosePlaybackSource(ctx, ranked, func(ctx context.Context, source StreamSource) (bool, string) {
		return s.probeDirectMediaCached(ctx, source, probeCache, probeCacheMu)
	})
}

func (s *Service) probeDirectMediaCached(
	ctx context.Context,
	source StreamSource,
	probeCache map[string]directProbeResult,
	probeCacheMu *sync.Mutex,
) (bool, string) {
	cacheKey := strings.TrimSpace(source.URL)
	if cacheKey == "" {
		return s.probeDirectMedia(ctx, source)
	}

	probeCacheMu.Lock()
	cached, ok := probeCache[cacheKey]
	probeCacheMu.Unlock()
	if ok {
		return cached.Playable, cached.ContentType
	}

	playable, contentType := s.probeDirectMedia(ctx, source)

	probeCacheMu.Lock()
	probeCache[cacheKey] = directProbeResult{Playable: playable, ContentType: contentType}
	probeCacheMu.Unlock()

	return playable, contentType
}

// probeDirectMedia checks if a direct media URL is playable.
// checks content-type header, reads prefix for magic bytes, falls back to URL extension.
func (s *Service) probeDirectMedia(ctx context.Context, source StreamSource) (bool, string) {
	probeCtx, cancel := context.WithTimeout(ctx, providerProbeTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, source.URL, nil)
	if err != nil {
		return false, ""
	}

	if source.Referer != "" {
		req.Header.Set("Referer", source.Referer)
	}
	req.Header.Set("User-Agent", defaultUserAgent)
	req.Header.Set("Range", "bytes=0-4095") // small range to detect playable content

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return false, ""
	}
	defer resp.Body.Close()

	// check content-type header first
	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if strings.Contains(contentType, "video/") || strings.Contains(contentType, "mpegurl") {
		return true, contentType
	}

	// check magic bytes in prefix
	prefix, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err == nil {
		if isLikelyM3U8(prefix) {
			return true, "application/vnd.apple.mpegurl"
		}
		if isLikelyMP4(prefix) {
			return true, "video/mp4"
		}
	}

	// fallback to URL extension
	finalURL := ""
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = strings.ToLower(resp.Request.URL.String())
	}

	if strings.Contains(finalURL, ".mp4") || strings.Contains(finalURL, ".m3u8") {
		return true, contentType
	}

	return false, contentType
}

// probeEmbedSource checks if an embed page is still available.
// returns false if the page contains deletion markers.
func (s *Service) probeEmbedSource(ctx context.Context, source StreamSource) bool {
	ctx, cancel := context.WithTimeout(ctx, providerProbeTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source.URL, nil)
	if err != nil {
		return false
	}

	if source.Referer != "" {
		req.Header.Set("Referer", source.Referer)
	}
	req.Header.Set("User-Agent", defaultUserAgent)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return false
	}

	// check for common deletion messages
	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return false
	}

	content := strings.ToLower(string(body))
	for _, marker := range []string{
		"file was deleted",
		"file has been deleted",
		"video was deleted",
		"video has been deleted",
		"video unavailable",
		"file not found",
		"this file does not exist",
		"resource unavailable",
	} {
		if strings.Contains(content, marker) {
			return false
		}
	}

	return true
}
