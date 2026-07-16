package anime

import (
	"context"
	"strings"
	"testing"
)

type staticIdentityProvider map[int]int

func (provider staticIdentityProvider) GetMALIDsByAniListID(_ context.Context, _ []int) (map[int]int, error) {
	return provider, nil
}

func TestParseAniBridgeMappings(t *testing.T) {
	payload := `{
		"anilist:20":{"mal:20":{},"tmdb_show:46260:s1":{"1-52":"1-52"},"tmdb_show:46260:s2":{"53-104":"53-104"},"tmdb_show:46260:s3":{"105-158":"105-158"},"tmdb_show:46260:s4":{"159-220":"159-220"}},
		"anilist:101280":{"mal:37430":{},"tmdb_show:82684:s1":{}},
		"anilist:108511":{"mal:39551":{},"tmdb_show:82684:s0":{},"tmdb_show:82684:s2":{}},
		"anilist:5":{"mal:5":{},"tmdb_movie:11299":{}},
		"anilist:31":{"mal:31":{},"tmdb_movie:21832":{},"tmdb_movie:54270":{}},
		"mal:37430":{"anilist:101280":{}}
	}`

	mappings, err := parseAniBridgeMappings(strings.NewReader(payload))
	if err != nil {
		t.Fatalf("parse mappings: %v", err)
	}
	if len(mappings) != 4 {
		t.Fatalf("got %d mappings, want 4", len(mappings))
	}

	byAniList := mappingsByAniList(mappings)
	naruto := byAniList[20]
	assertImportedMapping(t, naruto, "tv", 46260, 1)
	if len(naruto.Segments) != 4 {
		t.Fatalf("Naruto segments = %+v, want four TMDB seasons", naruto.Segments)
	}
	if second := naruto.Segments[1]; second.Season != 2 || second.SourceEpisodeMin != 53 || second.SourceEpisodeMax != 104 || second.TMDBEpisodeMin != 53 || second.TMDBEpisodeMax != 104 {
		t.Fatalf("Naruto season 2 segment = %+v", second)
	}
	assertImportedMapping(t, byAniList[108511], "tv", 82684, 2)
	assertImportedMapping(t, byAniList[5], "movie", 11299, -1)
	if _, ok := byAniList[31]; ok {
		t.Fatal("ambiguous multi-movie mapping should be omitted")
	}
}

func TestEpisodeRangeSupportsOpenEndedRanges(t *testing.T) {
	minimum, maximum, ok := episodeRange("1089-")
	if !ok || minimum != 1089 || maximum != 0 {
		t.Fatalf("episodeRange() = %d-%d, %v", minimum, maximum, ok)
	}
}

func TestHydrateMissingMALIDs(t *testing.T) {
	existing := int64(37430)
	mappings := []importedMapping{
		{AniListID: 101280, MALID: &existing},
		{AniListID: 207674},
		{AniListID: 999999},
	}
	syncer := &MappingSyncer{identityProvider: staticIdentityProvider{207674: 63468}}
	if err := syncer.hydrateMissingMALIDs(context.Background(), mappings); err != nil {
		t.Fatalf("hydrate missing MAL IDs: %v", err)
	}
	if mappings[0].MALID == nil || *mappings[0].MALID != existing {
		t.Fatalf("existing MAL ID changed: %+v", mappings[0])
	}
	if mappings[1].MALID == nil || *mappings[1].MALID != 63468 {
		t.Fatalf("missing MAL ID was not hydrated: %+v", mappings[1])
	}
	if mappings[2].MALID != nil {
		t.Fatalf("unresolved MAL ID should remain empty: %+v", mappings[2])
	}
}

func TestCompleteMappingIdentityUsesKnownExternalIDs(t *testing.T) {
	mapping := completeMappingIdentity(
		animeMapping{AniListID: 207674, Group: mappingGroup{MediaType: "tv", TMDBID: 325052}, Season: 1},
		mappingIdentity{AniListID: 207674, MALID: 63468},
	)
	if mapping.AniListID != 207674 || mapping.MALID != 63468 {
		t.Fatalf("mapping identity was not completed: %+v", mapping)
	}
}

func mappingsByAniList(mappings []importedMapping) map[int64]importedMapping {
	result := make(map[int64]importedMapping, len(mappings))
	for _, mapping := range mappings {
		result[mapping.AniListID] = mapping
	}
	return result
}

func assertImportedMapping(t *testing.T, mapping importedMapping, mediaType string, tmdbID int64, season int) {
	t.Helper()
	if mapping.MediaType != mediaType || mapping.TMDBID != tmdbID || mapping.Season != season {
		t.Fatalf("unexpected mapping: %+v", mapping)
	}
}

func TestBetterCanonicalPrefersSeasonOneAndManualOverride(t *testing.T) {
	group := mappingGroup{MediaType: "tv", TMDBID: 82684}
	seasonOne := animeMapping{AniListID: 101280, MALID: 37430, Group: group, Season: 1}
	seasonTwo := animeMapping{AniListID: 108511, MALID: 39551, Group: group, Season: 2}
	special := animeMapping{AniListID: 106509, MALID: 38793, Group: group, Season: 0}
	manual := animeMapping{AniListID: 108511, MALID: 39551, Group: group, Season: 2, Canonical: true}

	if !betterCanonical(seasonOne, seasonTwo) || !betterCanonical(seasonOne, special) {
		t.Fatal("season one should be the automatic canonical entry")
	}
	if !betterCanonical(manual, seasonOne) {
		t.Fatal("manual canonical override should win")
	}
}
