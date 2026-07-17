package anime

import (
	"testing"

	"mal/integrations/tmdb"
	"mal/internal/domain"
)

func TestDeduplicateAnimeMappingSegmentsPrefersNormalizedSeasonSplit(t *testing.T) {
	segments := deduplicateAnimeMappingSegments([]animeMappingSegment{
		{Season: 1, SourceEpisodeMin: 1, SourceEpisodeMax: 24, TMDBEpisodeMin: 25, TMDBEpisodeMax: 48},
		{Season: 2, SourceEpisodeMin: 1, SourceEpisodeMax: 24, TMDBEpisodeMin: 1, TMDBEpisodeMax: 24},
	})
	if len(segments) != 1 || segments[0].Season != 2 {
		t.Fatalf("segments = %+v, want only normalized season 2", segments)
	}
}

func TestSourceEpisodeNumberForTMDBMapsSplitCourLocally(t *testing.T) {
	mapping := animeMapping{EpisodeMin: 1, EpisodeMax: 12, TMDBEpisodeMin: 13, TMDBEpisodeMax: 24}
	number, ok := sourceEpisodeNumberForTMDB(mapping, tmdb.Episode{EpisodeNumber: 13}, 12, 24)
	if !ok || number != 1 {
		t.Fatalf("source episode = %d, %v; want 1, true", number, ok)
	}
	if _, ok := sourceEpisodeNumberForTMDB(mapping, tmdb.Episode{EpisodeNumber: 12}, 11, 24); ok {
		t.Fatal("episode outside the mapped cour should be ignored")
	}
}

func TestSourceEpisodeNumberForTMDBPreservesLongRunningNumbers(t *testing.T) {
	mapping := animeMapping{EpisodeMin: 53, EpisodeMax: 104, TMDBEpisodeMin: 53, TMDBEpisodeMax: 104}
	number, ok := sourceEpisodeNumberForTMDB(mapping, tmdb.Episode{EpisodeNumber: 53}, 0, 52)
	if !ok || number != 53 {
		t.Fatalf("source episode = %d, %v; want 53, true", number, ok)
	}
}

func TestTMDBContinuationMappingPreservesAbsoluteEpisodeNumbers(t *testing.T) {
	previous := animeMapping{
		MALID:          21,
		Group:          mappingGroup{MediaType: "tv", TMDBID: 37854},
		Season:         21,
		EpisodeMin:     892,
		EpisodeMax:     1088,
		TMDBEpisodeMin: 892,
		TMDBEpisodeMax: 1088,
		Kind:           episodeKindRegular,
	}
	next, ok := tmdbContinuationMapping(previous, tmdb.Season{
		SeasonNumber: 22,
		Episodes: []tmdb.Episode{
			{EpisodeNumber: 1089},
			{EpisodeNumber: 1155},
		},
	})
	if !ok {
		t.Fatal("expected continuation mapping")
	}
	if next.Season != 22 || next.EpisodeMin != 1089 || next.EpisodeMax != 1155 || next.TMDBEpisodeMin != 1089 || next.TMDBEpisodeMax != 1155 {
		t.Fatalf("continuation mapping = %+v", next)
	}
}

func TestTMDBContinuationMappingContinuesResetSeasonNumbers(t *testing.T) {
	previous := animeMapping{
		MALID:          123,
		Group:          mappingGroup{MediaType: "tv", TMDBID: 456},
		Season:         1,
		EpisodeMin:     1,
		EpisodeMax:     12,
		TMDBEpisodeMin: 1,
		TMDBEpisodeMax: 12,
		Kind:           episodeKindRegular,
	}
	next, ok := tmdbContinuationMapping(previous, tmdb.Season{
		SeasonNumber: 2,
		Episodes: []tmdb.Episode{
			{EpisodeNumber: 1},
			{EpisodeNumber: 12},
		},
	})
	if !ok {
		t.Fatal("expected continuation mapping")
	}
	if next.Season != 2 || next.EpisodeMin != 13 || next.EpisodeMax != 24 || next.TMDBEpisodeMin != 1 || next.TMDBEpisodeMax != 12 {
		t.Fatalf("reset continuation mapping = %+v", next)
	}
}

func TestSourceEpisodeDisplaysKeepsReleaseLocalNumbers(t *testing.T) {
	displays := sourceEpisodeDisplays(animeEpisodeSource{
		Anime:        domain.Anime{MalID: 20, TitleEnglish: "Naruto"},
		Episodes:     []domain.CanonicalEpisode{{Number: 53, Order: 530, Title: "Provider title"}},
		EpisodeMin:   53,
		EpisodeMax:   104,
		WatchAnimeID: 20,
		Kind:         episodeKindRegular,
	}, map[int]tmdb.Episode{53: {EpisodeNumber: 53, Name: "Long Time No See: Jiraiya Returns!"}})
	if len(displays) != 1 || displays[0].Label != "E53" || displays[0].WatchURL != "/anime/20/watch?ep=53" {
		t.Fatalf("release-local Naruto episode = %+v", displays)
	}
}

func TestSourceEpisodeDisplaysPreservesSpecialPlaybackID(t *testing.T) {
	displays := sourceEpisodeDisplays(animeEpisodeSource{
		Anime:        domain.Anime{MalID: 53580, Title: "Slime Season 3"},
		Episodes:     []domain.CanonicalEpisode{{Number: 0, ID: "0", Label: "0.5", Order: 5, Special: true, Title: "Diablo's Journal", HasSub: true}},
		WatchAnimeID: 53580,
		Kind:         episodeKindRegular,
	}, nil)
	if len(displays) != 1 || displays[0].Label != "E0.5" || displays[0].WatchURL != "/anime/53580/watch?ep=0" {
		t.Fatalf("release-local special = %+v", displays)
	}
}

func TestSourceEpisodeDisplaysTreatsEmptyKindAsRegular(t *testing.T) {
	displays := sourceEpisodeDisplays(animeEpisodeSource{
		Anime:    domain.Anime{MalID: 63802, TitleEnglish: "Mebius Dust"},
		Episodes: []domain.CanonicalEpisode{{Number: 1, ID: "1", Order: 10, Title: "Episode 1"}},
	}, map[int]tmdb.Episode{1: {ID: 1, EpisodeNumber: 1, SeasonNumber: 1, Name: "First Light", StillPath: "/first.jpg", Runtime: 24}})
	if len(displays) != 1 || displays[0].Title != "First Light" || displays[0].Duration != "24m" {
		t.Fatalf("regular episode display = %+v", displays)
	}
}

func TestSourceEpisodeDisplaysDeduplicatesTrailingSpecials(t *testing.T) {
	displays := sourceEpisodeDisplays(animeEpisodeSource{
		Anime: domain.Anime{MalID: 4181, Title: "CLANNAD: After Story"},
		Episodes: []domain.CanonicalEpisode{
			{Number: 23, ID: "23", Title: "The Event from One Year Before", HasSub: true, HasDub: true},
			{Number: 24, ID: "24", Title: "Under the Green Tree Recap", HasSub: true},
			{Number: 25, ID: "25", Title: "Under the Green Tree", HasDub: true},
		},
		EpisodeMin: 23,
		EpisodeMax: 25,
		Kind:       episodeKindBonus,
	}, map[int]tmdb.Episode{
		-3: {ID: 3, SeasonNumber: 0, EpisodeNumber: 3, Name: "The Event from One Year Before"},
		-4: {ID: 4, SeasonNumber: 0, EpisodeNumber: 4, Name: "Under the Green Tree"},
	})
	if len(displays) != 2 || displays[1].AudioLabel != "Dub | Sub" {
		t.Fatalf("deduplicated specials = %+v", displays)
	}
}

func TestOVATMDBEpisodeMatchesUsesUniqueSequence(t *testing.T) {
	source := animeEpisodeSource{Kind: episodeKindOVA, MediaOffset: 1, Episodes: []domain.CanonicalEpisode{
		{Number: 1, ID: "1", Title: "The Tragedy of M?"},
		{Number: 2, ID: "2", Title: "The Tragedy of M?"},
		{Number: 3, ID: "3", Title: "Episode 3"},
	}}
	media := map[int]tmdb.Episode{
		2: {ID: 2, SeasonNumber: 0, EpisodeNumber: 2, Name: "Extra: The Tragedy of M?"},
		3: {ID: 3, SeasonNumber: 0, EpisodeNumber: 3, Name: "Extra: Hey! Butts!"},
		4: {ID: 4, SeasonNumber: 0, EpisodeNumber: 4, Name: "Extra: Rimuru's Glamorous Life as a Teacher (1)"},
	}
	matches := ovaTMDBEpisodeMatches(source, media)
	if matches["1"].EpisodeNumber != 2 || matches["2"].EpisodeNumber != 3 || matches["3"].EpisodeNumber != 4 {
		t.Fatalf("OVA sequence = %+v", matches)
	}
}

func TestEpisodesWithinSourceBoundsKeepsLeadingSpecial(t *testing.T) {
	episodes := []domain.CanonicalEpisode{
		{ID: "0", Number: 0, Order: 5, Special: true},
		{ID: "1", Number: 1, Order: 10},
		{ID: "12", Number: 12, Order: 120},
		{ID: "13", Number: 13, Order: 130},
	}
	bounded := episodesWithinSourceBounds(episodes, 1, 12)
	if len(bounded) != 3 || bounded[0].ID != "0" || bounded[2].ID != "12" {
		t.Fatalf("bounded episodes = %+v", bounded)
	}
}

func TestMatchingTMDBEpisodeForSourceUsesDateForDuplicateSpecialTitle(t *testing.T) {
	episodes := map[int]tmdb.Episode{
		24: {ID: 24, SeasonNumber: 1, EpisodeNumber: 24, AirDate: "2019-03-19"},
		1:  {ID: 101, SeasonNumber: 0, EpisodeNumber: 1, Name: "Veldora's Journal", AirDate: "2019-03-26"},
		8:  {ID: 108, SeasonNumber: 0, EpisodeNumber: 8, Name: "Tales: Veldora's Journal 2", AirDate: "2021-06-29"},
	}
	episode := domain.CanonicalEpisode{Number: 24, ID: "24.5", Order: 245, Special: true, Title: "Veldora's Journal"}
	if match := matchingTMDBEpisodeForSource(episodes, 0, episode); match.ID != 101 {
		t.Fatalf("matched special = %+v", match)
	}
}

func TestAnimeEpisodeAirDate(t *testing.T) {
	if got := animeEpisodeAirDate("2026-02-13"); got != "02/13/2026" {
		t.Fatalf("animeEpisodeAirDate() = %q", got)
	}
}
