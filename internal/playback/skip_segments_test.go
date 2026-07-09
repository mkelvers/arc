package playback

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"mal/internal/database/db"
	"mal/internal/domain"
)

type wantSkipSegment struct {
	segmentType string
	start       float64
	end         float64
	source      string
}

func TestFetchSkipSegmentsFallsBackToOverridesWhenAniSkipFails(t *testing.T) {
	t.Parallel()

	svc := &playbackService{
		repo: &skipSegmentRepo{
			hasTable: true,
			overrides: []db.SkipSegmentOverrideRow{{
				UserID:    "user-1",
				AnimeID:   2167,
				Episode:   13,
				SkipType:  "op",
				StartTime: 90,
				EndTime:   180,
			}},
		},
		httpClient: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Body:       io.NopCloser(strings.NewReader("")),
				Header:     make(http.Header),
			}, nil
		})},
	}

	got, err := svc.fetchSkipSegments(context.Background(), "user-1", 2167, "13")
	if err != nil {
		t.Fatalf("fetchSkipSegments returned error with local fallback: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, want 1", len(got))
	}
	assertSkipSegment(t, got[0], wantSkipSegment{segmentType: "opening", start: 90, end: 180, source: "override"})
}

func TestFetchSkipSegmentsReturnsAniSkipErrorWhenNoOverrideFallbackExists(t *testing.T) {
	t.Parallel()

	svc := &playbackService{
		repo: &skipSegmentRepo{hasTable: true},
		httpClient: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Body:       io.NopCloser(strings.NewReader("")),
				Header:     make(http.Header),
			}, nil
		})},
	}

	got, err := svc.fetchSkipSegments(context.Background(), "user-1", 2167, "13")
	if err == nil {
		t.Fatal("fetchSkipSegments returned nil error without local fallback")
	}
	if got != nil {
		t.Fatalf("got segments = %+v, want nil", got)
	}
	if !strings.Contains(err.Error(), "aniskip: unexpected status: 500") {
		t.Fatalf("err = %v, want ani-skip status context", err)
	}
}

func TestFetchSkipSegmentsMergesOverridesWhenAniSkipSucceeds(t *testing.T) {
	t.Parallel()

	svc := &playbackService{
		repo: &skipSegmentRepo{
			hasTable: true,
			overrides: []db.SkipSegmentOverrideRow{{
				UserID:    "user-1",
				AnimeID:   2167,
				Episode:   13,
				SkipType:  "op",
				StartTime: 95,
				EndTime:   185,
			}},
		},
		httpClient: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body: io.NopCloser(strings.NewReader(`{
					"found": true,
					"results": [
						{"skip_type": "op", "interval": {"start_time": 80, "end_time": 170}},
						{"skip_type": "ed", "interval": {"start_time": 1300, "end_time": 1390}}
					]
				}`)),
				Header: make(http.Header),
			}, nil
		})},
	}

	got, err := svc.fetchSkipSegments(context.Background(), "user-1", 2167, "13")
	if err != nil {
		t.Fatalf("fetchSkipSegments returned error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2", len(got))
	}
	assertSkipSegment(t, got[0], wantSkipSegment{segmentType: "opening", start: 95, end: 185, source: "override"})
	assertSkipSegment(t, got[1], wantSkipSegment{segmentType: "ending", start: 1300, end: 1390, source: "aniskip"})
}

func assertSkipSegment(t *testing.T, got domain.SkipSegment, want wantSkipSegment) {
	t.Helper()

	if got.Type != want.segmentType || got.Start != want.start || got.End != want.end || got.Source != want.source {
		t.Fatalf("got segment = %+v, want type=%q start=%v end=%v source=%q", got, want.segmentType, want.start, want.end, want.source)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

type skipSegmentRepo struct {
	domain.PlaybackRepository
	hasTable  bool
	hasErr    error
	overrides []db.SkipSegmentOverrideRow
	listErr   error
}

func (r *skipSegmentRepo) HasSkipSegmentOverrideTable(context.Context) (bool, error) {
	return r.hasTable, r.hasErr
}

func (r *skipSegmentRepo) ListSkipSegmentOverrides(context.Context, string, int64, int64) ([]db.SkipSegmentOverrideRow, error) {
	return r.overrides, r.listErr
}
