package service

import (
	"testing"

	"mal/internal/domain"
)

func TestMergeEpisodeDataPreservesFractionalProviderEpisodes(t *testing.T) {
	episodes := mergeEpisodes(domain.EpisodeAvailability{
		Sub:    []string{"24.5", "24", "1"},
		Dub:    []string{"24.5", "24", "1"},
		Titles: map[string]string{"24.5": "Veldora's Journal"},
	}, 24)

	if len(episodes) != 3 {
		t.Fatalf("len(episodes) = %d, want 3", len(episodes))
	}
	special := episodes[2]
	if !special.Special || special.PlaybackID() != "24.5" || special.DisplayLabel() != "24.5" || special.SortOrder() != 245 {
		t.Fatalf("fractional episode was not preserved: %+v", special)
	}
}

func TestMergeEpisodeDataNormalizesZeroSpecialPosition(t *testing.T) {
	episodes := mergeEpisodes(domain.EpisodeAvailability{Sub: []string{"0", "1"}}, 24)
	if len(episodes) != 2 {
		t.Fatalf("len(episodes) = %d, want 2", len(episodes))
	}
	if got := episodes[0]; !got.Special || got.PlaybackID() != "0" || got.DisplayLabel() != "0.5" || got.SortOrder() != 5 {
		t.Fatalf("zero special was not normalized: %+v", got)
	}
}

func TestMergeEpisodeDataRejectsInventoryOutlierAfterContiguousRun(t *testing.T) {
	episodes := mergeEpisodes(domain.EpisodeAvailability{Sub: []string{"86", "3", "2", "1"}}, 0)
	if len(episodes) != 3 {
		t.Fatalf("len(episodes) = %d, want contiguous episodes 1-3", len(episodes))
	}
	if episodes[2].Number != 3 {
		t.Fatalf("last episode = %+v, want episode 3", episodes[2])
	}
}
