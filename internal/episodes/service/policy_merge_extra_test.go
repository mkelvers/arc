package service

import (
	"testing"
	"time"

	"mal/integrations/metadata"
	"mal/internal/domain"
)

func TestMergeEpisodesFiltersProviderBackedProviderToAvailableNumbers(t *testing.T) {
	episodes := mergeEpisodes([]metadata.Episode{
		{Episode: "1", Title: "Available"},
		{Episode: "2", Title: "Unavailable"},
		{Episode: "3", Title: "Dubbed"},
	}, domain.EpisodeAvailability{
		Sub: []int{1},
		Dub: []int{3},
	}, 0)

	if len(episodes) != 2 {
		t.Fatalf("len(episodes) = %d, want 2", len(episodes))
	}
	assertEpisode(t, episodes[0], 1, "Available", true, false, true, false)
	assertEpisode(t, episodes[1], 3, "Dubbed", false, true, false, false)
}

func TestMergeEpisodesHonorsExpectedCountForAvailability(t *testing.T) {
	episodes := mergeEpisodes(nil, domain.EpisodeAvailability{
		Sub: []int{0, 1, 2, 4},
		Dub: []int{-1, 2, 3, 5},
	}, 3)

	if len(episodes) != 3 {
		t.Fatalf("len(episodes) = %d, want 3", len(episodes))
	}
	assertEpisode(t, episodes[0], 1, "Episode 1", true, false, true, false)
	assertEpisode(t, episodes[1], 2, "Episode 2", true, true, false, false)
	assertEpisode(t, episodes[2], 3, "Episode 3", false, true, false, false)
}

func TestIsCanonicalEpisodePayloadValidAllowsProviderPayloadWhenNoExpectedCount(t *testing.T) {
	payload := domain.CanonicalEpisodeList{
		Source: "AllAnime",
		Episodes: []domain.CanonicalEpisode{
			{Number: 1, HasSub: true},
			{Number: 2, HasDub: true},
		},
	}

	if !isCanonicalEpisodePayloadValid(payload, 0) {
		t.Fatalf("expected provider-backed payload with availability to be valid")
	}
}

func TestIsCanonicalEpisodePayloadValidRejectsOutOfRangeEpisodeNumber(t *testing.T) {
	payload := domain.CanonicalEpisodeList{
		Episodes: []domain.CanonicalEpisode{
			{Number: 0, Title: "Invalid"},
		},
	}

	if isCanonicalEpisodePayloadValid(payload, 12) {
		t.Fatalf("expected zero episode number to be invalid")
	}
}

func TestNextRefreshAtForFinishedAnimeIsEmpty(t *testing.T) {
	now := time.Date(2026, 5, 16, 13, 0, 0, 0, time.UTC)
	got := nextRefreshAt(domain.Anime{Anime: metadata.Anime{Airing: false}}, now)

	if got.Valid {
		t.Fatalf("nextRefreshAt finished anime = %s, want invalid", got.Time)
	}
}

func TestNextRefreshAtRetriesSoonAfterRecentBroadcast(t *testing.T) {
	anime := domain.Anime{Anime: metadata.Anime{Airing: true}}
	anime.Broadcast.Day = "Saturdays"
	anime.Broadcast.Time = "12:00"
	anime.Broadcast.Timezone = "UTC"
	now := time.Date(2026, 5, 16, 13, 0, 0, 0, time.UTC)

	got := nextRefreshAt(anime, now)
	want := now.Add(retryInterval).UTC()
	if !got.Valid || !got.Time.Equal(want) {
		t.Fatalf("nextRefreshAt = %#v, want %s", got, want)
	}
}

func TestNextRefreshAtFallsBackWhenBroadcastMetadataMissing(t *testing.T) {
	anime := domain.Anime{Anime: metadata.Anime{Airing: true}}
	now := time.Date(2026, 5, 16, 13, 0, 0, 0, time.UTC)

	got := nextRefreshAt(anime, now)
	want := now.Add(airingFallbackRefreshInterval).UTC()
	if !got.Valid || !got.Time.Equal(want) {
		t.Fatalf("nextRefreshAt = %#v, want %s", got, want)
	}
}

func TestBroadcastHelpersRejectInvalidValues(t *testing.T) {
	if day := weekdayFromProvider("someday"); day != -1 {
		t.Fatalf("weekdayFromProvider invalid = %d, want -1", day)
	}
	if _, _, ok := parseBroadcastTime("25:99"); ok {
		t.Fatalf("parseBroadcastTime should reject invalid time")
	}

	anime := domain.Anime{Anime: metadata.Anime{MalID: 1}}
	anime.Broadcast.Day = "Saturdays"
	anime.Broadcast.Time = "bad"
	if got := nextBroadcastAfter(anime, time.Date(2026, 5, 16, 13, 0, 0, 0, time.UTC)); !got.IsZero() {
		t.Fatalf("nextBroadcastAfter invalid time = %s, want zero", got)
	}
}
