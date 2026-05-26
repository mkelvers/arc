package service

import (
	"mal/integrations/jikan"
	"mal/internal/domain"
	"testing"
	"time"
)

func TestMergeEpisodesUsesUnionAndSynthesizesProviderOnlyEntries(t *testing.T) {
	episodes := mergeEpisodes([]jikan.Episode{
		{MalID: 1, Title: "Start"},
		{MalID: 2, Title: "Second", Filler: true},
		{MalID: 5, Title: "Future", Recap: true},
	}, domain.EpisodeAvailability{
		Sub: []int{1, 2, 3, 6},
		Dub: []int{1, 2, 3},
	})

	if len(episodes) != 5 {
		t.Fatalf("len(episodes) = %d, want 5", len(episodes))
	}

	assertEpisode(t, episodes[0], 1, "Start", true, true, false, false, false)
	assertEpisode(t, episodes[1], 2, "Second", true, true, false, true, false)
	assertEpisode(t, episodes[2], 3, "Episode 3", true, true, false, false, false)
	assertEpisode(t, episodes[3], 5, "Future", false, false, false, false, true)
	assertEpisode(t, episodes[4], 6, "Episode 6", true, false, true, false, false)
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

func assertEpisode(t *testing.T, got domain.CanonicalEpisode, number int, title string, sub bool, dub bool, subOnly bool, filler bool, recap bool) {
	t.Helper()
	if got.Number != number || got.Title != title || got.HasSub != sub || got.HasDub != dub || got.SubOnly != subOnly || got.Filler != filler || got.Recap != recap {
		t.Fatalf("episode = %+v, want number=%d title=%q sub=%t dub=%t subOnly=%t filler=%t recap=%t", got, number, title, sub, dub, subOnly, filler, recap)
	}
}
