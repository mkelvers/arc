package anime

import (
	"testing"
	"time"

	"mal/integrations/tmdb"
	"mal/internal/domain"
)

func TestTMDBSeasonDisplaysHidesUnavailableSpecials(t *testing.T) {
	seasons := []tmdb.SeasonSummary{
		{SeasonNumber: 0, Name: "Specials", EpisodeCount: 26},
		{SeasonNumber: 1, Name: "Season 1", EpisodeCount: 38},
		{SeasonNumber: 2, Name: "Season 2", EpisodeCount: 12},
	}

	displays := tmdbSeasonDisplays(seasons, map[int]int{1: 28, 2: 10}, 1)
	if len(displays) != 2 || displays[0].Number != 1 || displays[1].Number != 2 {
		t.Fatalf("unexpected seasons without playable specials: %+v", displays)
	}

	displays = tmdbSeasonDisplays(seasons, map[int]int{0: 3, 1: 28}, 0)
	if len(displays) != 1 || displays[0].Number != 1 {
		t.Fatalf("specials and unavailable seasons should not be exposed as selector entries: %+v", displays)
	}
}

func TestSelectableEpisodeSeasonFallsBackFromUnavailableSeason(t *testing.T) {
	seasons := []animeSeasonDisplay{
		{Number: 1, Label: "Season 1", Count: 12},
		{Number: 3, Label: "Season 3", Count: 8},
	}

	selected, ok := selectableEpisodeSeason(seasons, 2)
	if !ok || selected != 1 {
		t.Fatalf("selectableEpisodeSeason() = %d, %v; want 1, true", selected, ok)
	}

	selected, ok = selectableEpisodeSeason(seasons, 3)
	if !ok || selected != 3 {
		t.Fatalf("selectableEpisodeSeason() = %d, %v; want 3, true", selected, ok)
	}
}

func TestApplyAdjacentSeasonLinksKeepsCanonicalAnimeRoute(t *testing.T) {
	display := animeEpisodeListDisplay{
		AnimeID:  52347,
		Selected: 2,
		Seasons: []animeSeasonDisplay{
			{Number: 1, Label: "Season 1"},
			{Number: 2, Label: "Season 2", Selected: true},
			{Number: 3, Label: "Season 3"},
		},
	}

	applyAdjacentSeasonLinks(&display)

	if display.Previous == nil || display.Previous.FragmentURL != "/anime/52347/episodes/1" {
		t.Fatalf("Previous = %+v, want canonical season 1 route", display.Previous)
	}
	if display.Next == nil || display.Next.FragmentURL != "/anime/52347/episodes/3" {
		t.Fatalf("Next = %+v, want canonical season 3 route", display.Next)
	}
}

func TestAnimeEpisodeListURL(t *testing.T) {
	if got := animeEpisodeListURL(52347, 2); got != "/anime/52347/episodes/2" {
		t.Fatalf("animeEpisodeListURL() = %q, want season fragment URL", got)
	}
	if got := animeEpisodeListURL(52347, -1); got != "/anime/52347/episodes" {
		t.Fatalf("animeEpisodeListURL() without season = %q", got)
	}
}

func TestDeduplicateAnimeMappingSegmentsPrefersNormalizedSeasonSplit(t *testing.T) {
	segments := deduplicateAnimeMappingSegments([]animeMappingSegment{
		{Season: 1, SourceEpisodeMin: 1, SourceEpisodeMax: 24, TMDBEpisodeMin: 25, TMDBEpisodeMax: 48},
		{Season: 2, SourceEpisodeMin: 1, SourceEpisodeMax: 24, TMDBEpisodeMin: 1, TMDBEpisodeMax: 24},
	})

	if len(segments) != 1 || segments[0].Season != 2 {
		t.Fatalf("segments = %+v, want only normalized season 2", segments)
	}
}

func TestSourceEpisodeDisplaysPreservesInlineSpecialPlaybackID(t *testing.T) {
	displays := sourceEpisodeDisplays(animeEpisodeSource{
		Anime:         domain.Anime{MalID: 53580, Title: "Slime Season 3"},
		Episodes:      []domain.CanonicalEpisode{{Number: 0, ID: "0", Label: "0.5", Order: 5, Special: true, Title: "Diablo's Journal", HasSub: true}},
		DisplayOffset: 48,
		WatchAnimeID:  37430,
		Kind:          episodeKindRegular,
	}, nil)

	if len(displays) != 1 || displays[0].Label != "E48.5" {
		t.Fatalf("inline special display = %+v, want E48.5", displays)
	}
	if displays[0].WatchURL != "/anime/53580/watch?ep=0" {
		t.Fatalf("WatchURL = %q, want direct provider special URL", displays[0].WatchURL)
	}
}

func TestSourceEpisodeDisplaysSeparatesAndDeduplicatesTrailingSpecials(t *testing.T) {
	displays := sourceEpisodeDisplays(animeEpisodeSource{
		Anime: domain.Anime{MalID: 4181, Title: "CLANNAD: After Story"},
		Episodes: []domain.CanonicalEpisode{
			{Number: 22, ID: "22", Order: 220, Title: "Small Palms", HasSub: true, HasDub: true},
			{Number: 23, ID: "23", Order: 230, Title: "The Event from One Year Before", HasSub: true, HasDub: true},
			{Number: 24, ID: "24", Order: 240, Title: "Under the Green Tree Recap", HasSub: true},
			{Number: 25, ID: "25", Order: 250, Title: "Under the Green Tree", HasDub: true},
		},
		EpisodeMin: 23,
		EpisodeMax: 25,
		Kind:       episodeKindBonus,
	}, map[int]tmdb.Episode{
		-3: {ID: 3, SeasonNumber: 0, EpisodeNumber: 3, Name: "The Event from One Year Before"},
		-4: {ID: 4, SeasonNumber: 0, EpisodeNumber: 4, Name: "Under the Green Tree"},
	})

	if len(displays) != 2 {
		t.Fatalf("len(displays) = %d, want 2: %+v", len(displays), displays)
	}
	if displays[0].Label != "E3" || displays[0].WatchURL != "/anime/4181/watch?ep=23" {
		t.Fatalf("first special = %+v", displays[0])
	}
	if displays[1].Label != "E4" || displays[1].WatchURL != "/anime/4181/watch?ep=24" || displays[1].AudioLabel != "Dub | Sub" {
		t.Fatalf("deduplicated special = %+v", displays[1])
	}
}

func TestEpisodeDisplaysCombinesMappedAndTrailingSpecialsInTMDBOrder(t *testing.T) {
	media := map[int]tmdb.Episode{
		-1: {ID: 1, SeasonNumber: 0, EpisodeNumber: 1, Name: "The Events of Summer Holidays"},
		-2: {ID: 2, SeasonNumber: 0, EpisodeNumber: 2, Name: "Another World: Tomoyo Chapter"},
		-3: {ID: 3, SeasonNumber: 0, EpisodeNumber: 3, Name: "The Event from One Year Before"},
		-4: {ID: 4, SeasonNumber: 0, EpisodeNumber: 4, Name: "Under the Green Tree"},
		-5: {ID: 5, SeasonNumber: 0, EpisodeNumber: 5, Name: "Another World: Kyou Chapter"},
	}
	sources := []animeEpisodeSource{
		{Anime: domain.Anime{MalID: 2167}, Episodes: []domain.CanonicalEpisode{{Number: 23, ID: "23", Title: "The Events of Summer Holidays"}}, Kind: episodeKindBonus},
		{Anime: domain.Anime{MalID: 4059}, Episodes: []domain.CanonicalEpisode{{Number: 1, ID: "1", Title: "Another World: Tomoyo Chapter"}}, Kind: episodeKindBonus},
		{Anime: domain.Anime{MalID: 4181}, Episodes: []domain.CanonicalEpisode{{Number: 23, ID: "23", Title: "The Event from One Year Before"}, {Number: 24, ID: "24", Title: "Under the Green Tree"}}, Kind: episodeKindBonus},
		{Anime: domain.Anime{MalID: 6351}, Episodes: []domain.CanonicalEpisode{{Number: 1, ID: "1", Title: "Another World: Kyou Chapter"}}, Kind: episodeKindBonus},
	}

	displays := episodeDisplays(sources, media)
	if len(displays) != 5 {
		t.Fatalf("len(displays) = %d, want 5: %+v", len(displays), displays)
	}
	for index, display := range displays {
		want := index + 1
		if display.Number != want || display.Order != want*10 {
			t.Fatalf("display %d = %+v, want TMDB special %d", index, display, want)
		}
	}
}

func TestBonusEpisodeDisplaysUsesAirDateForGenericStandaloneTitle(t *testing.T) {
	displays := sourceEpisodeDisplays(animeEpisodeSource{
		Anime: domain.Anime{
			MalID: 6351,
			Title: "CLANNAD: Another World, Kyou Chapter",
			Aired: domain.Aired{From: "2009-07-01T00:00:00Z", To: "2009-07-01T00:00:00Z"},
		},
		Episodes: []domain.CanonicalEpisode{{Number: 1, ID: "1", Title: "Episode 1", HasSub: true, HasDub: true}},
		Kind:     episodeKindBonus,
	}, map[int]tmdb.Episode{
		-4: {ID: 4, SeasonNumber: 0, EpisodeNumber: 4, Name: "Under the Green Tree", AirDate: "2009-03-26"},
		-5: {ID: 5, SeasonNumber: 0, EpisodeNumber: 5, Name: "Another World: Kyou Chapter", AirDate: "2009-07-01", StillPath: "/kyou.jpg", Runtime: 24},
	})

	if len(displays) != 1 {
		t.Fatalf("len(displays) = %d, want 1", len(displays))
	}
	if displays[0].Label != "E5" || displays[0].Title != "Another World: Kyou Chapter" || displays[0].Duration != "24m" {
		t.Fatalf("Kyou display = %+v", displays[0])
	}
}

func TestAppendSyntheticSeasonsLabelsOVAs(t *testing.T) {
	displays := appendSyntheticSeasons(nil, map[int]int{ovaSeasonBase + 1: 5, ovaSeasonBase + 2: 3}, map[int]string{
		ovaSeasonBase + 1: "OVA Season 1",
		ovaSeasonBase + 2: "OVA Season 2",
	}, ovaSeasonBase+2)
	if len(displays) != 2 {
		t.Fatalf("len(displays) = %d, want 2", len(displays))
	}
	if displays[0].Label != "OVA Season 1" || displays[1].Label != "OVA Season 2" || !displays[1].Selected {
		t.Fatalf("unexpected OVA seasons: %+v", displays)
	}
}

func TestClassifySpecialMappingsUsesSharedSpecialsSeason(t *testing.T) {
	mappings := []animeMapping{{Season: 0}, {Season: 0}, {Season: 0}}
	classifySpecialMapping(&mappings[0], 5, domain.Anime{}, false)
	classifySpecialMapping(&mappings[1], 2, domain.Anime{}, false)
	classifySpecialMapping(&mappings[2], 3, domain.Anime{}, false)

	if mappings[0].SeasonLabel != "Specials" || mappings[1].SeasonLabel != "Specials" || mappings[2].SeasonLabel != "Specials" {
		t.Fatalf("unexpected special labels: %+v", mappings)
	}
	if mappings[0].LogicalSeason != bonusSeason || mappings[1].LogicalSeason != bonusSeason || mappings[2].LogicalSeason != bonusSeason {
		t.Fatalf("special mappings were not grouped together: %+v", mappings)
	}
}

func TestAssignSpecialGroupSeasonsKeepsTitlesSeparate(t *testing.T) {
	plan := []animeMapping{
		{AniListID: 161802, Kind: episodeKindOVA, ReleaseDate: "2023-11-01T00:00:00Z", TMDBEpisodeMin: 11, SeasonLabel: "Visions of Coleus"},
		{AniListID: 99999, Kind: episodeKindOVA, ReleaseDate: "2022-03-19T00:00:00Z", SeasonLabel: "Sukuwareru Ramiris"},
		{AniListID: 106509, Kind: episodeKindOVA, ReleaseDate: "2019-07-09T00:00:00Z", TMDBEpisodeMin: 2, SeasonLabel: "That Time I Got Reincarnated as a Slime OAD"},
		{AniListID: 999, Kind: episodeKindBonus, SeasonLabel: "Specials"},
	}

	assignSpecialGroupSeasons(plan)
	if plan[2].LogicalSeason != ovaSeasonBase+1 || plan[1].LogicalSeason != ovaSeasonBase+2 || plan[0].LogicalSeason != ovaSeasonBase+3 {
		t.Fatalf("special groups were not ordered by release date: %+v", plan)
	}
	if plan[3].LogicalSeason != 0 {
		t.Fatalf("generic specials group was changed: %+v", plan[3])
	}
}

func TestAssignSpecialGroupLabelsRemovesSharedFranchiseTitle(t *testing.T) {
	plan := []animeMapping{
		{MALID: 1, Kind: episodeKindRegular, LogicalSeason: 1},
		{MALID: 2, Kind: episodeKindOVA, SeasonLabel: "That Time I Got Reincarnated as a Slime OAD"},
		{MALID: 3, Kind: episodeKindOVA, SeasonLabel: "Tensei Shitara Slime Datta Ken: Sukuwareru Ramiris"},
		{MALID: 4, Kind: episodeKindOVA, SeasonLabel: "That Time I Got Reincarnated as a Slime: Visions of Coleus"},
	}
	metadata := map[int]domain.Anime{
		1: {TitleEnglish: "That Time I Got Reincarnated as a Slime", Title: "Tensei Shitara Slime Datta Ken"},
		2: {TitleEnglish: "That Time I Got Reincarnated as a Slime OAD"},
		3: {Title: "Tensei Shitara Slime Datta Ken: Sukuwareru Ramiris"},
		4: {TitleEnglish: "That Time I Got Reincarnated as a Slime: Visions of Coleus"},
	}

	assignSpecialGroupLabels(plan, metadata)
	want := []string{"", "OAD", "Sukuwareru Ramiris", "Visions of Coleus"}
	for i := range plan {
		if plan[i].SeasonLabel != want[i] {
			t.Fatalf("plan[%d].SeasonLabel = %q, want %q", i, plan[i].SeasonLabel, want[i])
		}
	}
}

func TestSeasonZeroMappingDoesNotInheritPreviousSpecialOffset(t *testing.T) {
	offsets := map[int]int{0: 6, 2: 12}
	if got := episodeMappingMediaOffset(animeMapping{Season: 0}, offsets); got != 0 {
		t.Fatalf("season-zero media offset = %d, want 0", got)
	}
	if got := episodeMappingMediaOffset(animeMapping{Season: 0, EpisodeMin: 1, TMDBEpisodeMin: 9}, offsets); got != 8 {
		t.Fatalf("explicit season-zero media offset = %d, want 8", got)
	}
	if got := episodeMappingMediaOffset(animeMapping{Season: 2}, offsets); got != 12 {
		t.Fatalf("regular media offset = %d, want 12", got)
	}

	advanceMappingMediaOffset(animeMapping{Season: 0, EpisodeCount: 2}, offsets)
	if offsets[0] != 6 {
		t.Fatalf("inferred season-zero offset advanced to %d, want 6", offsets[0])
	}
}

func TestDisambiguateSpecialEpisodeOrdersReservesEarlierInlineSpecial(t *testing.T) {
	episodes := []animeEpisodeDisplay{{Number: 23, Label: "E23.5", Order: 235}}
	plan := []animeMapping{{Kind: episodeKindInline, LogicalSeason: 1, DisplayOffset: 23}}

	disambiguateSpecialEpisodeOrders(episodes, plan, 2)
	if episodes[0].Order != 236 || episodes[0].Label != "E23.6" {
		t.Fatalf("special episode = %+v, want the next free fractional position", episodes[0])
	}
}

func TestInlineSpecialAnchorAfterSeasonFinale(t *testing.T) {
	plan := []animeMapping{{
		Season: 1, LogicalSeason: 1, MediaOffset: 0, DisplayOffset: 0, EpisodeCount: 12, Kind: episodeKindRegular,
	}}
	anchor, season, ok := inlineSpecialAnchor(plan, tmdb.Episode{AirDate: "2016-03-04"}, []tmdb.Episode{
		{ID: 1, SeasonNumber: 1, EpisodeNumber: 1, AirDate: "2015-07-11"},
		{ID: 12, SeasonNumber: 1, EpisodeNumber: 12, AirDate: "2015-09-26"},
	})
	if !ok || anchor != 12 || season != 1 {
		t.Fatalf("placement = anchor %d season %d ok %v, want 12, 1, true", anchor, season, ok)
	}
}

func TestAssignRegularDisplayOffsetsIgnoresSpecialInventory(t *testing.T) {
	plan := []animeMapping{
		{Kind: episodeKindRegular, EpisodeCount: 24},
		{Kind: episodeKindInline, EpisodeCount: 1},
		{Kind: episodeKindRegular, EpisodeCount: 24},
		{Kind: episodeKindOVA, EpisodeCount: 5},
	}
	assignRegularDisplayOffsets(plan)
	if plan[2].DisplayOffset != 24 {
		t.Fatalf("second TV season offset = %d, want 24", plan[2].DisplayOffset)
	}
	if plan[1].DisplayOffset != 0 || plan[3].DisplayOffset != 0 {
		t.Fatalf("special inventory changed display offsets: %+v", plan)
	}
}

func TestSourceEpisodeDisplaysPreservesGlobalNumbersAcrossOneAnimeTMDBSeasons(t *testing.T) {
	source := animeEpisodeSource{
		Anime:         domain.Anime{MalID: 20, TitleEnglish: "Naruto"},
		Episodes:      []domain.CanonicalEpisode{{Number: 53, Order: 530, Title: "Provider title"}},
		DisplayOffset: 52,
		MediaOffset:   0,
		WatchAnimeID:  20,
		EpisodeMin:    53,
		EpisodeMax:    104,
		Kind:          episodeKindRegular,
	}
	displays := sourceEpisodeDisplays(source, map[int]tmdb.Episode{
		53: {EpisodeNumber: 53, Name: "Long Time No See: Jiraiya Returns!"},
	})
	if len(displays) != 1 || displays[0].Label != "E53" || displays[0].WatchURL != "/anime/20/watch?ep=53" || displays[0].Title != "Long Time No See: Jiraiya Returns!" {
		t.Fatalf("segmented Naruto episode = %+v", displays)
	}
}

func TestSourceEpisodeDisplaysTreatsEmptyKindAsRegular(t *testing.T) {
	displays := sourceEpisodeDisplays(animeEpisodeSource{
		Anime:    domain.Anime{MalID: 63802, TitleEnglish: "Mebius Dust"},
		Episodes: []domain.CanonicalEpisode{{Number: 1, ID: "1", Order: 10, Title: "Episode 1"}},
	}, map[int]tmdb.Episode{
		1: {ID: 1, EpisodeNumber: 1, SeasonNumber: 1, Name: "First Light", StillPath: "/first.jpg", Runtime: 24},
	})

	if len(displays) != 1 || displays[0].Title != "First Light" || displays[0].ImageURL != tmdb.ImageURL("/first.jpg", "w500") || displays[0].Duration != "24m" {
		t.Fatalf("fallback regular episode display = %+v", displays)
	}
}

func TestOVATMDBEpisodeMatchesUsesUniqueSequence(t *testing.T) {
	source := animeEpisodeSource{Kind: episodeKindOVA, MediaOffset: 1, Episodes: []domain.CanonicalEpisode{
		{Number: 1, ID: "1", Order: 10, Title: "The Tragedy of M?"},
		{Number: 2, ID: "2", Order: 20, Title: "The Tragedy of M?"},
		{Number: 3, ID: "3", Order: 30, Title: "Extra: Rimuru's Glamorous Life as a Teacher, Part 1"},
		{Number: 4, ID: "4", Order: 40, Title: "Episode 4"},
		{Number: 5, ID: "5", Order: 50, Title: "Episode 5"},
	}}
	media := map[int]tmdb.Episode{
		2: {ID: 2, SeasonNumber: 0, EpisodeNumber: 2, Name: "Extra: The Tragedy of M?"},
		3: {ID: 3, SeasonNumber: 0, EpisodeNumber: 3, Name: "Extra: Hey! Butts!"},
		4: {ID: 4, SeasonNumber: 0, EpisodeNumber: 4, Name: "Extra: Rimuru's Glamorous Life as a Teacher (1)"},
		5: {ID: 5, SeasonNumber: 0, EpisodeNumber: 5, Name: "Extra: Rimuru's Glamorous Life as a Teacher (2)"},
		6: {ID: 6, SeasonNumber: 0, EpisodeNumber: 6, Name: "Extra: Rimuru's Glamorous Life as a Teacher (3)"},
	}

	matches := ovaTMDBEpisodeMatches(source, media)
	if matches["1"].Name != "Extra: The Tragedy of M?" || matches["2"].Name != "Extra: Hey! Butts!" {
		t.Fatalf("duplicate provider title was not repaired: %+v", matches)
	}
	if matches["4"].EpisodeNumber != 5 || matches["5"].EpisodeNumber != 6 {
		t.Fatalf("OVA sequence did not retain unique later metadata: %+v", matches)
	}
}

func TestOVATMDBEpisodeMatchesUsesDatesForUntitledShorts(t *testing.T) {
	source := animeEpisodeSource{
		Kind: episodeKindShorts,
		Anime: domain.Anime{Aired: domain.Aired{
			From: "2022-03-19T00:00:00Z",
			To:   "2022-07-29T00:00:00Z",
		}},
		Episodes: []domain.CanonicalEpisode{
			{Number: 1, ID: "1", Order: 10, Title: "Episode 1"},
			{Number: 2, ID: "2", Order: 20, Title: "Episode 2"},
		},
	}
	media := map[int]tmdb.Episode{
		8:  {ID: 8, SeasonNumber: 0, EpisodeNumber: 8, Name: "Veldora 2", AirDate: "2021-06-29"},
		9:  {ID: 9, SeasonNumber: 0, EpisodeNumber: 9, Name: "Sukuwareru Ramiris - 01", AirDate: "2022-03-19"},
		10: {ID: 10, SeasonNumber: 0, EpisodeNumber: 10, Name: "Sukuwareru Ramiris - 02", AirDate: "2022-07-21"},
		11: {ID: 11, SeasonNumber: 0, EpisodeNumber: 11, Name: "To Coleus", AirDate: "2023-11-01"},
	}

	matches := ovaTMDBEpisodeMatches(source, media)
	if matches["1"].EpisodeNumber != 9 || matches["2"].EpisodeNumber != 10 {
		t.Fatalf("short sequence = %+v, want TMDB specials 9-10", matches)
	}
}

func TestAnimeEpisodeAirDate(t *testing.T) {
	if got := animeEpisodeAirDate("2026-02-13"); got != "02/13/2026" {
		t.Fatalf("animeEpisodeAirDate() = %q, want %q", got, "02/13/2026")
	}
}

func TestApplySelectedSeasonLabel(t *testing.T) {
	display := animeEpisodeListDisplay{
		SeasonLabel: "Season",
		Seasons: []animeSeasonDisplay{
			{Number: 1, Label: "Season 1"},
			{Number: 2, Label: "Season 2", Selected: true},
		},
	}

	applySelectedSeasonLabel(&display)
	if display.SeasonLabel != "Season 2" {
		t.Fatalf("SeasonLabel = %q, want %q", display.SeasonLabel, "Season 2")
	}
}

func TestSyncSelectedEpisodeCountUsesRenderedInventory(t *testing.T) {
	display := animeEpisodeListDisplay{
		Selected: 2000,
		Seasons: []animeSeasonDisplay{
			{Number: 1, Count: 22},
			{Number: 2000, Count: 5, Selected: true},
		},
		Episodes: make([]animeEpisodeDisplay, 4),
	}

	syncSelectedEpisodeCount(&display)
	if display.Seasons[1].Count != 4 {
		t.Fatalf("special count = %d, want rendered count 4", display.Seasons[1].Count)
	}
}

func TestRegularSeasonLabelIncludesOrdinalAndTitle(t *testing.T) {
	if got := regularSeasonLabel(2, "Mob Psycho 100 II"); got != "Season 2: Mob Psycho 100 II" {
		t.Fatalf("regularSeasonLabel() = %q, want %q", got, "Season 2: Mob Psycho 100 II")
	}
	if got := regularSeasonLabel(3, ""); got != "Season 3" {
		t.Fatalf("regularSeasonLabel() without title = %q, want %q", got, "Season 3")
	}
}

func TestApplyPlaybackSeasonsUsesStableSeasonLabels(t *testing.T) {
	display := animeEpisodeListDisplay{Selected: 1}
	plan := []animeMapping{
		{MALID: 32182, LogicalSeason: 1, AvailableCount: 12, SeasonLabel: "Season 1: Mob Psycho 100"},
		{MALID: 37510, LogicalSeason: 2, AvailableCount: 13, SeasonLabel: "Season 2: Mob Psycho 100 II"},
		{MALID: 50172, LogicalSeason: 3, AvailableCount: 12, SeasonLabel: "Season 3: Mob Psycho 100 III"},
	}

	applyPlaybackSeasons(plan, &display)

	if len(display.Seasons) != 3 {
		t.Fatalf("len(display.Seasons) = %d, want 3", len(display.Seasons))
	}
	if display.SeasonLabel != "Season 1" {
		t.Fatalf("SeasonLabel = %q, want stable first-season label", display.SeasonLabel)
	}
	if display.Seasons[1].Label != "Season 2" || display.Seasons[2].Label != "Season 3" {
		t.Fatalf("unexpected mapped season labels: %+v", display.Seasons)
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
		t.Fatalf("bounded episodes = %+v, want leading special and episodes 1-12", bounded)
	}
}

func TestMatchingTMDBEpisodeForSourceUsesDateForDuplicateSpecialTitle(t *testing.T) {
	episodes := map[int]tmdb.Episode{
		24: {ID: 24, SeasonNumber: 1, EpisodeNumber: 24, Name: "Black and the Mask", AirDate: "2019-03-19"},
		1:  {ID: 101, SeasonNumber: 0, EpisodeNumber: 1, Name: "Veldora's Journal", AirDate: "2019-03-26"},
		8:  {ID: 108, SeasonNumber: 0, EpisodeNumber: 8, Name: "Tales: Veldora's Journal 2", AirDate: "2021-06-29"},
	}
	episode := domain.CanonicalEpisode{Number: 24, ID: "24.5", Order: 245, Special: true, Title: "Veldora's Journal"}

	match := matchingTMDBEpisodeForSource(episodes, 0, episode)
	if match.ID != 101 {
		t.Fatalf("matched special = %+v, want the first journal after season 1", match)
	}
}

func TestApplyPlaybackSeasonsIncludesMappedSeasonWithoutCachedCount(t *testing.T) {
	display := animeEpisodeListDisplay{Selected: 1}
	plan := []animeMapping{
		{MALID: 30831, LogicalSeason: 1, AvailableCount: 10, SeasonLabel: "Season 1: KonoSuba"},
		{MALID: 32937, LogicalSeason: 2, SeasonLabel: "Season 2"},
		{MALID: 49458, LogicalSeason: 3, SeasonLabel: "Season 3"},
	}

	applyPlaybackSeasons(plan, &display)

	if len(display.Seasons) != 3 {
		t.Fatalf("len(display.Seasons) = %d, want all 3 mapped seasons", len(display.Seasons))
	}
	if display.Seasons[1].Count != 0 || display.Seasons[2].Count != 0 {
		t.Fatalf("uncached season counts should remain unknown: %+v", display.Seasons)
	}
}

func TestApplyPlaybackSeasonsCollapsesSplitCourLabels(t *testing.T) {
	display := animeEpisodeListDisplay{Selected: 1}
	plan := []animeMapping{
		{MALID: 39535, LogicalSeason: 1, AvailableCount: 11, SeasonLabel: "Season 1: Mushoku Tensei: Jobless Reincarnation"},
		{MALID: 45576, LogicalSeason: 1, AvailableCount: 13, SeasonLabel: "Season 1: Mushoku Tensei: Jobless Reincarnation Part 2"},
		{MALID: 51179, LogicalSeason: 2, AvailableCount: 12, SeasonLabel: "Season 2: Mushoku Tensei: Jobless Reincarnation Season 2"},
		{MALID: 55888, LogicalSeason: 2, AvailableCount: 13, SeasonLabel: "Season 2: Mushoku Tensei: Jobless Reincarnation Season 2 Part 2"},
	}

	applyPlaybackSeasons(plan, &display)

	if len(display.Seasons) != 2 {
		t.Fatalf("len(display.Seasons) = %d, want 2", len(display.Seasons))
	}
	if display.SeasonLabel != "Season 1" {
		t.Fatalf("SeasonLabel = %q, want collapsed season label", display.SeasonLabel)
	}
	if display.Seasons[0].Label != "Season 1" || display.Seasons[0].Count != 24 {
		t.Fatalf("season 1 was not collapsed cleanly: %+v", display.Seasons[0])
	}
	if display.Seasons[1].Label != "Season 2" || display.Seasons[1].Count != 25 {
		t.Fatalf("season 2 was not collapsed cleanly: %+v", display.Seasons[1])
	}
}

func TestSelectableEpisodeMappingFiltersUnreleasedSeasons(t *testing.T) {
	now := time.Date(2026, 7, 15, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name        string
		anime       domain.Anime
		hasMetadata bool
		want        bool
	}{
		{
			name:        "missing metadata keeps imported mapping selectable",
			hasMetadata: false,
			want:        true,
		},
		{
			name:        "finished season without cached count remains selectable",
			anime:       domain.Anime{Status: "Finished Airing"},
			hasMetadata: true,
			want:        true,
		},
		{
			name:        "currently airing season remains selectable",
			anime:       domain.Anime{Status: "Currently Airing", Airing: true},
			hasMetadata: true,
			want:        true,
		},
		{
			name:        "not yet aired status is hidden",
			anime:       domain.Anime{Status: "Not yet aired"},
			hasMetadata: true,
			want:        false,
		},
		{
			name: "future start date is hidden",
			anime: domain.Anime{Status: "Currently Airing", Aired: domain.Aired{
				From: "2026-10-01T00:00:00Z",
			}},
			hasMetadata: true,
			want:        false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := selectableEpisodeMapping(animeMapping{MALID: 30831, Season: 1}, test.anime, test.hasMetadata, now); got != test.want {
				t.Fatalf("selectableEpisodeMapping() = %v, want %v", got, test.want)
			}
		})
	}
}
