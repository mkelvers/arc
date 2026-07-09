package service

import (
	"testing"

	"mal/integrations/metadata"
	"mal/internal/domain"
)

func TestMergeEpisodeClassificationsRestoresFillerAndRecap(t *testing.T) {
	episodes := []domain.CanonicalEpisode{
		{Number: 1, Title: "First", HasSub: true},
		{Number: 2, Title: "Second", HasSub: true},
		{Number: 3, Title: "Third", HasSub: true},
	}

	mergeEpisodeClassifications(episodes, []metadata.Episode{
		{Episode: "1"},
		{Episode: "2", Filler: true},
		{Episode: "3", Recap: true},
	})

	if episodes[0].Filler || episodes[0].Recap {
		t.Fatalf("episode 1 = %#v", episodes[0])
	}
	if !episodes[1].Filler || episodes[1].Recap {
		t.Fatalf("episode 2 = %#v", episodes[1])
	}
	if episodes[2].Filler || !episodes[2].Recap {
		t.Fatalf("episode 3 = %#v", episodes[2])
	}
}
