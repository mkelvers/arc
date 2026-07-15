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

func TestClassifySpecialMappingKeepsShortsBetweenOVASeasons(t *testing.T) {
	counters := specialSeasonCounters{}
	mappings := []animeMapping{{Season: 0}, {Season: 0}, {Season: 0}}
	classifySpecialMapping(&mappings[0], 5, "OVA", &counters)
	classifySpecialMapping(&mappings[1], 2, "ONA", &counters)
	classifySpecialMapping(&mappings[2], 3, "OVA", &counters)

	if mappings[0].SeasonLabel != "OVA Season 1" || mappings[1].SeasonLabel != "Shorts" || mappings[2].SeasonLabel != "OVA Season 2" {
		t.Fatalf("unexpected special labels: %+v", mappings)
	}
	if mappings[0].LogicalSeason >= mappings[1].LogicalSeason || mappings[1].LogicalSeason >= mappings[2].LogicalSeason {
		t.Fatalf("special seasons are not chronological: %+v", mappings)
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

func TestOVATMDBEpisodeMatchesUsesUniqueSequence(t *testing.T) {
	source := animeEpisodeSource{Kind: episodeKindOVA, Episodes: []domain.CanonicalEpisode{
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
	if matches["1"].Name != "Extra: Hey! Butts!" || matches["2"].Name != "Extra: The Tragedy of M?" {
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

func TestRegularSeasonLabelIncludesOrdinalAndTitle(t *testing.T) {
	if got := regularSeasonLabel(2, "Mob Psycho 100 II"); got != "Season 2: Mob Psycho 100 II" {
		t.Fatalf("regularSeasonLabel() = %q, want %q", got, "Season 2: Mob Psycho 100 II")
	}
	if got := regularSeasonLabel(3, ""); got != "Season 3" {
		t.Fatalf("regularSeasonLabel() without title = %q, want %q", got, "Season 3")
	}
}

func TestApplyPlaybackSeasonsIncludesCompleteMappedSeries(t *testing.T) {
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
	if display.SeasonLabel != "Season 1: Mob Psycho 100" {
		t.Fatalf("SeasonLabel = %q, want explicit first-season label", display.SeasonLabel)
	}
	if display.Seasons[1].Label != "Season 2: Mob Psycho 100 II" || display.Seasons[2].Label != "Season 3: Mob Psycho 100 III" {
		t.Fatalf("unexpected mapped season labels: %+v", display.Seasons)
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
