package service

import (
	"database/sql"
	"encoding/json"
	"mal/integrations/jikan"
	"mal/internal/db"
	"mal/internal/domain"
	"testing"
	"time"
)

func TestMergeEpisodesUsesProviderAvailabilityAsSourceOfTruth(t *testing.T) {
	episodes := mergeEpisodes([]jikan.Episode{
		{MalID: 101, Episode: "1", Title: "Start"},
		{MalID: 102, Episode: "2", Title: "Second", Filler: true},
		{MalID: 105, Episode: "5", Title: "Future", Recap: true},
	}, domain.EpisodeAvailability{
		Sub: []int{1, 2, 3, 6},
		Dub: []int{1, 2, 3},
	}, 0)

	if len(episodes) != 4 {
		t.Fatalf("len(episodes) = %d, want 4", len(episodes))
	}

	assertEpisode(t, episodes[0], 1, "Start", true, true, false, false)
	assertEpisode(t, episodes[1], 2, "Second", true, true, false, true)
	assertEpisode(t, episodes[2], 3, "Episode 3", true, true, false, false)
	assertEpisode(t, episodes[3], 6, "Episode 6", true, false, true, false)
}

func TestMergeEpisodesUsesJikanWhenProviderAvailabilityMissing(t *testing.T) {
	episodes := mergeEpisodes([]jikan.Episode{
		{MalID: 101, Episode: "1", Title: "Start"},
		{MalID: 102, Episode: "2", Title: "Second"},
	}, domain.EpisodeAvailability{}, 0)

	if len(episodes) != 2 {
		t.Fatalf("len(episodes) = %d, want 2", len(episodes))
	}

	assertEpisode(t, episodes[0], 1, "Start", false, false, false, false)
	assertEpisode(t, episodes[1], 2, "Second", false, false, false, false)
}

func TestMergeEpisodesSkipsFutureJikanEpisodesWithoutProviderAvailability(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	anime := domain.Anime{Anime: jikan.Anime{
		MalID:  62076,
		Airing: true,
		Aired:  jikan.Aired{From: "2026-06-03T00:00:00+00:00"},
	}}
	episodes := mergeEpisodesForAnime(anime, decodeJikanEpisodes(t, `[
		{"mal_id":1,"title":"Episode 1","episode":null,"aired":"2026-07-09T00:00:00+00:00"},
		{"mal_id":2,"title":"Episode 2","episode":null,"aired":"2026-07-16T00:00:00+00:00"}
	]`), domain.EpisodeAvailability{}, now, false)

	if len(episodes) != 0 {
		t.Fatalf("len(episodes) = %d, want 0", len(episodes))
	}
}

func TestMergeEpisodesSkipsUndatedJikanEpisodesForAiringAnimeWithoutProviderAvailability(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	anime := domain.Anime{Anime: jikan.Anime{
		MalID:  62076,
		Airing: true,
		Aired:  jikan.Aired{From: "2026-06-03T00:00:00+00:00"},
	}}
	episodes := mergeEpisodesForAnime(anime, []jikan.Episode{
		{MalID: 1, Title: "Episode 1"},
		{MalID: 2, Title: "Episode 2"},
	}, domain.EpisodeAvailability{}, now, false)

	if len(episodes) != 0 {
		t.Fatalf("len(episodes) = %d, want 0", len(episodes))
	}
}

func TestMergeEpisodesKeepsReleasedJikanEpisodesWithoutProviderAvailability(t *testing.T) {
	now := time.Date(2026, time.July, 10, 12, 0, 0, 0, time.UTC)
	anime := domain.Anime{Anime: jikan.Anime{
		MalID:  62076,
		Airing: true,
		Aired:  jikan.Aired{From: "2026-06-03T00:00:00+00:00"},
	}}
	episodes := mergeEpisodesForAnime(anime, decodeJikanEpisodes(t, `[
		{"mal_id":1,"title":"Episode 1","episode":null,"aired":"2026-07-09T00:00:00+00:00"},
		{"mal_id":2,"title":"Episode 2","episode":null,"aired":"2026-07-16T00:00:00+00:00"}
	]`), domain.EpisodeAvailability{}, now, false)

	if len(episodes) != 1 {
		t.Fatalf("len(episodes) = %d, want 1", len(episodes))
	}
	assertEpisode(t, episodes[0], 1, "Episode 1", false, false, false, false)
}

func TestMergeEpisodesTreatsEmptyProviderAvailabilityAsAuthoritative(t *testing.T) {
	now := time.Date(2026, time.July, 10, 12, 0, 0, 0, time.UTC)
	anime := domain.Anime{Anime: jikan.Anime{
		MalID:  62076,
		Airing: true,
		Aired:  jikan.Aired{From: "2026-06-03T00:00:00+00:00"},
	}}
	episodes := mergeEpisodesForAnime(anime, decodeJikanEpisodes(t, `[
		{"mal_id":1,"title":"Episode 1","episode":null,"aired":"2026-07-09T00:00:00+00:00"}
	]`), domain.EpisodeAvailability{}, now, true)

	if len(episodes) != 0 {
		t.Fatalf("len(episodes) = %d, want 0", len(episodes))
	}
}

func TestMergeEpisodesIgnoresInvalidJikanEpisodeNumbers(t *testing.T) {
	episodes := mergeEpisodes([]jikan.Episode{
		{MalID: 201, Episode: "", Title: "Missing"},
		{MalID: 202, Episode: "Preview", Title: "Preview"},
		{MalID: 203, Episode: "0", Title: "Zero"},
	}, domain.EpisodeAvailability{}, 0)

	if len(episodes) != 3 {
		t.Fatalf("len(episodes) = %d, want 3", len(episodes))
	}

	assertEpisode(t, episodes[0], 1, "Missing", false, false, false, false)
	assertEpisode(t, episodes[1], 2, "Preview", false, false, false, false)
	assertEpisode(t, episodes[2], 3, "Zero", false, false, false, false)
}

func TestMergeEpisodesCapsMalformedJikanListsToDeclaredEpisodeCount(t *testing.T) {
	episodes := mergeEpisodes([]jikan.Episode{
		{MalID: 301, Episode: "", Title: "Rimuru's Busy Life"},
		{MalID: 302, Episode: "", Title: "Trade with the Animal Kingdom"},
		{MalID: 303, Episode: "", Title: "Paradise, Once More"},
		{MalID: 304, Episode: "", Title: "The Scheming Kingdom of Falmuth"},
		{MalID: 305, Episode: "", Title: "Prelude to the Disaster"},
		{MalID: 306, Episode: "", Title: "The Beauty Makes Her Move"},
		{MalID: 307, Episode: "", Title: "Despair"},
		{MalID: 308, Episode: "", Title: "Hope"},
		{MalID: 309, Episode: "", Title: "Putting Everything on the Line"},
		{MalID: 310, Episode: "", Title: "Megiddo"},
		{MalID: 311, Episode: "", Title: "Birth of a Demon Lord"},
		{MalID: 312, Episode: "", Title: "The One Unleashed"},
		{MalID: 313, Episode: "", Title: "The Visitors"},
	}, domain.EpisodeAvailability{
		Sub: []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13},
		Dub: []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13},
	}, 12)

	if len(episodes) != 12 {
		t.Fatalf("len(episodes) = %d, want 12", len(episodes))
	}

	assertEpisode(t, episodes[0], 1, "Rimuru's Busy Life", true, true, false, false)
	assertEpisode(t, episodes[11], 12, "The One Unleashed", true, true, false, false)
}

func TestIsCanonicalEpisodePayloadValidRejectsOverflowingCachedPayload(t *testing.T) {
	payload := domain.CanonicalEpisodeList{
		Episodes: []domain.CanonicalEpisode{
			{Number: 1, Title: "Episode 1"},
			{Number: 2, Title: "Episode 2"},
			{Number: 13, Title: "Episode 13"},
		},
	}

	if isCanonicalEpisodePayloadValid(payload, 12) {
		t.Fatal("expected cached payload to be rejected")
	}
}

func TestIsCanonicalEpisodePayloadValidRejectsProviderEpisodesWithoutAvailability(t *testing.T) {
	payload := domain.CanonicalEpisodeList{
		Source: "AllAnime",
		Episodes: []domain.CanonicalEpisode{
			{Number: 1, Title: "Episode 1", HasSub: true},
			{Number: 2, Title: "Episode 2"},
		},
	}

	if isCanonicalEpisodePayloadValid(payload, 13) {
		t.Fatal("expected cached payload to be rejected")
	}
}

func TestIsCanonicalEpisodePayloadValidAllowsJikanFallbackWithoutAvailability(t *testing.T) {
	payload := domain.CanonicalEpisodeList{
		Source: "jikan_fallback",
		Episodes: []domain.CanonicalEpisode{
			{Number: 1, Title: "Episode 1"},
			{Number: 2, Title: "Episode 2"},
		},
	}

	if !isCanonicalEpisodePayloadValid(payload, 13) {
		t.Fatal("expected cached payload to be valid")
	}
}

func TestDecodeCachedPayloadRejectsUncheckedAiringJikanFallback(t *testing.T) {
	svc := &EpisodeService{}
	anime := domain.Anime{Anime: jikan.Anime{
		MalID:  62076,
		Airing: true,
	}}
	raw := `{"anime_id":62076,"source":"jikan_fallback","episodes":[{"number":1,"title":"Episode 1"}]}`

	if _, ok := svc.decodeCachedPayload(anime, raw); ok {
		t.Fatal("expected unchecked airing jikan fallback cache to be rejected")
	}
}

func TestDecodeCachedPayloadRejectsOldReleaseCheckedAiringFallback(t *testing.T) {
	svc := &EpisodeService{}
	anime := domain.Anime{Anime: jikan.Anime{
		MalID:  62076,
		Airing: true,
	}}
	raw := `{"anime_id":62076,"source":"jikan_fallback","release_checked":true,"episodes":[{"number":1,"title":"Episode 1"}]}`

	if _, ok := svc.decodeCachedPayload(anime, raw); ok {
		t.Fatal("expected old release-checked jikan fallback cache to be rejected")
	}
}

func TestDecodeCachedPayloadRejectsOldAiringProviderPayload(t *testing.T) {
	svc := &EpisodeService{}
	anime := domain.Anime{Anime: jikan.Anime{
		MalID:  62076,
		Airing: true,
	}}
	raw := `{"anime_id":62076,"source":"AllAnime","episodes":[{"number":1,"title":"Episode 1","has_sub":true}]}`

	if _, ok := svc.decodeCachedPayload(anime, raw); ok {
		t.Fatal("expected old airing provider cache to be rejected")
	}
}

func TestDecodeCachedPayloadAllowsCurrentReleaseCheckedJikanFallback(t *testing.T) {
	svc := &EpisodeService{}
	anime := domain.Anime{Anime: jikan.Anime{
		MalID:  62076,
		Airing: true,
	}}
	raw := `{"anime_id":62076,"source":"jikan_fallback","availability_version":2,"release_checked":true,"episodes":[{"number":1,"title":"Episode 1"}]}`

	if _, ok := svc.decodeCachedPayload(anime, raw); !ok {
		t.Fatal("expected release-checked jikan fallback cache to be valid")
	}
}

func TestEnrichCachedPayloadAddsRefreshMetadata(t *testing.T) {
	now := time.Date(2026, time.June, 27, 11, 0, 0, 0, time.UTC)
	payload := enrichCachedPayload(domain.CanonicalEpisodeList{
		AnimeID:  59970,
		Episodes: []domain.CanonicalEpisode{{Number: 1}},
		Source:   "AllAnime",
	}, db.EpisodeAvailabilityCache{
		NextRefreshAt: sql.NullTime{Time: now.Add(time.Hour), Valid: true},
		RetryUntilAt:  sql.NullTime{Time: now.Add(30 * time.Minute), Valid: true},
		LastAttemptAt: sql.NullTime{Time: now.Add(-5 * time.Minute), Valid: true},
		LastSuccessAt: sql.NullTime{Time: now.Add(-time.Hour), Valid: true},
		FailureCount:  2,
	})

	if payload.NextRefreshAt != "2026-06-27T12:00:00Z" {
		t.Fatalf("NextRefreshAt = %q, want RFC3339 timestamp", payload.NextRefreshAt)
	}
	if payload.RetryUntilAt != "2026-06-27T11:30:00Z" {
		t.Fatalf("RetryUntilAt = %q, want RFC3339 timestamp", payload.RetryUntilAt)
	}
	if payload.LastAttemptAt != "2026-06-27T10:55:00Z" {
		t.Fatalf("LastAttemptAt = %q, want RFC3339 timestamp", payload.LastAttemptAt)
	}
	if payload.LastSuccessAt != "2026-06-27T10:00:00Z" {
		t.Fatalf("LastSuccessAt = %q, want RFC3339 timestamp", payload.LastSuccessAt)
	}
	if payload.FailureCount != 2 {
		t.Fatalf("FailureCount = %d, want 2", payload.FailureCount)
	}
}

func TestNextBroadcastAfterUsesJikanTimezone(t *testing.T) {
	anime := domain.Anime{Anime: jikan.Anime{MalID: 1}}
	anime.Broadcast.Day = "Saturdays"
	anime.Broadcast.Time = "23:00"
	anime.Broadcast.Timezone = "Asia/Tokyo"

	after := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)
	got := nextBroadcastAfter(anime, after)
	want := time.Date(2026, 5, 16, 14, 0, 0, 0, time.UTC)

	if !got.Equal(want) {
		t.Fatalf("nextBroadcastAfter() = %s, want %s", got, want)
	}
}

func TestNextRetryTimeWithinAndAfterRetryWindow(t *testing.T) {
	anime := domain.Anime{Anime: jikan.Anime{MalID: 1}}
	anime.Broadcast.Day = "Saturdays"
	anime.Broadcast.Time = "12:00"
	anime.Broadcast.Timezone = "UTC"

	within := time.Date(2026, 5, 16, 13, 0, 0, 0, time.UTC)
	if got := nextRetryTime(anime, within); !got.Equal(within.Add(retryInterval)) {
		t.Fatalf("nextRetryTime(within) = %s, want %s", got, within.Add(retryInterval))
	}

	after := time.Date(2026, 5, 16, 16, 1, 0, 0, time.UTC)
	want := time.Date(2026, 5, 23, 12, 0, 0, 0, time.UTC)
	if got := nextRetryTime(anime, after); !got.Equal(want) {
		t.Fatalf("nextRetryTime(after) = %s, want %s", got, want)
	}
}

func decodeJikanEpisodes(t *testing.T, raw string) []jikan.Episode {
	t.Helper()

	var episodes []jikan.Episode
	if err := json.Unmarshal([]byte(raw), &episodes); err != nil {
		t.Fatalf("json.Unmarshal episodes: %v", err)
	}
	return episodes
}

func assertEpisode(t *testing.T, got domain.CanonicalEpisode, number int, title string, sub bool, dub bool, subOnly bool, filler bool) {
	t.Helper()
	if got.Number != number || got.Title != title || got.HasSub != sub || got.HasDub != dub || got.SubOnly != subOnly || got.Filler != filler || got.Recap {
		t.Fatalf("episode = %+v, want number=%d title=%q sub=%t dub=%t subOnly=%t filler=%t recap=false", got, number, title, sub, dub, subOnly, filler)
	}
}
