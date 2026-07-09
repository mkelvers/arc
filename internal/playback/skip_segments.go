package playback

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"mal/internal/database/db"
	"mal/internal/domain"
	errlog "mal/pkg"
	netutil "mal/pkg/net"
)

func normalizeSkipType(skipType string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(skipType)) {
	case "op", "opening", "intro":
		return "op", nil
	case "ed", "ending", "outro":
		return "ed", nil
	default:
		return "", fmt.Errorf("invalid skip_type %q", skipType)
	}
}

func (s *playbackService) UpsertSkipSegmentOverride(ctx context.Context, userID string, animeID int64, episode int, skipType string, startTime, endTime float64) error {
	if userID == "" {
		return fmt.Errorf("not authenticated")
	}
	if animeID <= 0 || episode <= 0 {
		return fmt.Errorf("invalid anime/episode: anime_id=%d episode=%d", animeID, episode)
	}
	t, err := normalizeSkipType(skipType)
	if err != nil {
		return fmt.Errorf("normalize skip type: %w", err)
	}
	if !(startTime >= 0) || !(endTime > startTime) {
		return fmt.Errorf("invalid interval: start=%f end=%f", startTime, endTime)
	}
	if endTime-startTime < 5 || endTime-startTime > 10*60 {
		return fmt.Errorf("interval duration out of range: duration=%f", endTime-startTime)
	}
	if err := s.repo.UpsertSkipSegmentOverride(ctx, db.SkipSegmentOverrideRow{
		ID:        uuid.New().String(),
		UserID:    userID,
		AnimeID:   animeID,
		Episode:   int64(episode),
		SkipType:  t,
		StartTime: startTime,
		EndTime:   endTime,
	}); err != nil {
		return fmt.Errorf("upsert skip segment override: %w", err)
	}
	return nil
}

func (s *playbackService) fetchSkipSegments(ctx context.Context, userID string, malID int, episode string) ([]domain.SkipSegment, error) {
	if malID <= 0 || strings.TrimSpace(episode) == "" {
		return []domain.SkipSegment{}, nil
	}

	segments, err := s.fetchAniSkipSegments(ctx, malID, episode)
	if err != nil {
		overrides := s.loadSkipSegmentOverrides(ctx, userID, malID, episode)
		if len(overrides) > 0 {
			return mergeSkipSegments(nil, overrides), nil
		}
		return nil, fmt.Errorf("aniskip: %w", err)
	}

	overrides := s.loadSkipSegmentOverrides(ctx, userID, malID, episode)
	if len(overrides) == 0 {
		return segments, nil
	}
	return mergeSkipSegments(segments, overrides), nil
}

func (s *playbackService) fetchAniSkipSegments(ctx context.Context, malID int, episode string) ([]domain.SkipSegment, error) {
	endpoint := fmt.Sprintf("https://api.aniskip.com/v1/skip-times/%s/%s?types=op&types=ed", url.PathEscape(strconv.Itoa(malID)), url.PathEscape(episode))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", netutil.Generic)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer func() {
		errlog.Log("failed to close aniskip response body", resp.Body.Close())
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.KiB512))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	return parseAniSkipSegments(body), nil
}

func parseAniSkipSegments(body []byte) []domain.SkipSegment {
	type resultItem struct {
		SkipType string `json:"skip_type"`
		Interval struct {
			StartTime float64 `json:"start_time"`
			EndTime   float64 `json:"end_time"`
		} `json:"interval"`
	}
	type apiResponse struct {
		Found  bool         `json:"found"`
		Result []resultItem `json:"results"`
	}

	var parsed apiResponse
	if err := json.Unmarshal(body, &parsed); err != nil || !parsed.Found || len(parsed.Result) == 0 {
		return nil
	}

	segments := make([]domain.SkipSegment, 0, len(parsed.Result))
	for _, item := range parsed.Result {
		segments = append(segments, domain.SkipSegment{
			Type:   normalizeSkipSegmentLabel(item.SkipType),
			Start:  item.Interval.StartTime,
			End:    item.Interval.EndTime,
			Source: "aniskip",
		})
	}

	return segments
}

func normalizeSkipSegmentLabel(skipType string) string {
	switch strings.ToLower(strings.TrimSpace(skipType)) {
	case "op":
		return "opening"
	case "ed":
		return "ending"
	default:
		return strings.ToLower(strings.TrimSpace(skipType))
	}
}

func (s *playbackService) loadSkipSegmentOverrides(ctx context.Context, userID string, malID int, episode string) map[string]domain.SkipSegment {
	epNum, err := strconv.ParseInt(strings.TrimSpace(episode), 10, 64)
	if userID == "" || err != nil || epNum <= 0 {
		return nil
	}

	ok, err := s.repo.HasSkipSegmentOverrideTable(ctx)
	if err != nil || !ok {
		return nil
	}

	overrides, err := s.repo.ListSkipSegmentOverrides(ctx, userID, int64(malID), epNum)
	if err != nil {
		return nil
	}

	return buildOverrideSegments(overrides)
}

func buildOverrideSegments(overrides []db.SkipSegmentOverrideRow) map[string]domain.SkipSegment {
	byType := make(map[string]domain.SkipSegment, len(overrides))
	for _, override := range overrides {
		skipType, ok := normalizeOverrideSkipType(override.SkipType)
		if !ok {
			continue
		}

		byType[skipType] = domain.SkipSegment{
			Type:   skipType,
			Start:  override.StartTime,
			End:    override.EndTime,
			Source: "override",
		}
	}

	return byType
}

func normalizeOverrideSkipType(skipType string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(skipType)) {
	case "op", "opening", "intro":
		return "opening", true
	case "ed", "ending", "outro":
		return "ending", true
	default:
		return "", false
	}
}

func mergeSkipSegments(segments []domain.SkipSegment, overrides map[string]domain.SkipSegment) []domain.SkipSegment {
	merged := make([]domain.SkipSegment, 0, len(segments)+len(overrides))
	seen := make(map[string]bool, len(segments))

	for _, segment := range segments {
		if override, ok := overrides[segment.Type]; ok {
			merged = append(merged, override)
		} else {
			merged = append(merged, segment)
		}
		seen[segment.Type] = true
	}

	for skipType, override := range overrides {
		if !seen[skipType] {
			merged = append(merged, override)
		}
	}

	return merged
}
