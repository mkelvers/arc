package anime

import (
	"context"
	"testing"

	"mal/integrations/anilist"
	"mal/internal/domain"
)

type fakeMappingResolver struct {
	resolved  map[mappingIdentity]animeMapping
	canonical map[mappingGroup]animeMapping
}

func (f fakeMappingResolver) Resolve(context.Context, []mappingIdentity) (map[mappingIdentity]animeMapping, map[mappingGroup]animeMapping, error) {
	return f.resolved, f.canonical, nil
}

type fakeAnimeHydrator struct {
	items []anilist.Anime
}

type fakeSavingResolver struct {
	fakeMappingResolver
	saved []inferredAnimeMapping
}

func (f *fakeSavingResolver) SaveInferred(_ context.Context, mappings []inferredAnimeMapping) error {
	f.saved = append(f.saved, mappings...)
	return nil
}

func (f fakeAnimeHydrator) GetAnimeBatchByMALID(context.Context, []int) ([]anilist.Anime, error) {
	return f.items, nil
}

func TestCardGrouperCollapsesTVEntriesAndKeepsSeparateWorks(t *testing.T) {
	slime := mappingGroup{MediaType: "tv", TMDBID: 82684}
	diaries := mappingGroup{MediaType: "tv", TMDBID: 136840}
	movie := mappingGroup{MediaType: "movie", TMDBID: 116776}
	root := animeMapping{AniListID: 101280, MALID: 37430, Group: slime, Season: 1}
	seasonTwo := animeMapping{AniListID: 108511, MALID: 39551, Group: slime, Season: 2}
	seasonTwoPartTwo := animeMapping{AniListID: 116742, MALID: 41487, Group: slime, Season: 2}
	diary := animeMapping{AniListID: 140501, MALID: 50184, Group: diaries, Season: 1}
	film := animeMapping{AniListID: 139498, MALID: 49877, Group: movie, Season: -1}

	resolver := fakeMappingResolver{
		resolved: map[mappingIdentity]animeMapping{
			{AniListID: seasonTwo.AniListID, MALID: seasonTwo.MALID}:               seasonTwo,
			{AniListID: seasonTwoPartTwo.AniListID, MALID: seasonTwoPartTwo.MALID}: seasonTwoPartTwo,
			{AniListID: diary.AniListID, MALID: diary.MALID}:                       diary,
			{AniListID: film.AniListID, MALID: film.MALID}:                         film,
		},
		canonical: map[mappingGroup]animeMapping{slime: root, diaries: diary, movie: film},
	}
	grouper := &CardGrouper{
		mappings: resolver,
		metadata: fakeAnimeHydrator{items: []anilist.Anime{{
			ID: root.AniListID, MALID: root.MALID,
			Title:      anilist.Titles{English: "That Time I Got Reincarnated as a Slime"},
			CoverImage: "https://example.com/slime.jpg",
		}}},
	}
	input := []domain.Anime{
		{AniListID: seasonTwo.AniListID, MalID: seasonTwo.MALID, TitleEnglish: "Slime Season 2"},
		{AniListID: seasonTwoPartTwo.AniListID, MalID: seasonTwoPartTwo.MALID, TitleEnglish: "Slime Season 2 Part 2"},
		{AniListID: diary.AniListID, MalID: diary.MALID, TitleEnglish: "The Slime Diaries"},
		{AniListID: film.AniListID, MalID: film.MALID, TitleEnglish: "Scarlet Bond"},
	}

	grouped, err := grouper.Group(context.Background(), input)
	if err != nil {
		t.Fatalf("group cards: %v", err)
	}
	if len(grouped) != 3 {
		t.Fatalf("got %d cards, want 3", len(grouped))
	}
	if grouped[0].AniListID != root.AniListID || grouped[0].MalID != root.MALID {
		t.Fatalf("first card is not canonical root: %+v", grouped[0])
	}
	if grouped[0].DisplayTitle() != "That Time I Got Reincarnated as a Slime" {
		t.Fatalf("unexpected canonical title %q", grouped[0].DisplayTitle())
	}
	if grouped[1].MalID != diary.MALID || grouped[2].MalID != film.MALID {
		t.Fatalf("spin-off and movie should remain separate: %+v", grouped)
	}
}

func TestCardGrouperHydratesCanonicalMALOnlyCardFromAniList(t *testing.T) {
	group := mappingGroup{MediaType: "tv", TMDBID: 82684}
	root := animeMapping{AniListID: 101280, MALID: 37430, Group: group, Season: 1}
	identity := mappingIdentity{MALID: root.MALID}
	grouper := &CardGrouper{
		mappings: fakeMappingResolver{
			resolved:  map[mappingIdentity]animeMapping{identity: root},
			canonical: map[mappingGroup]animeMapping{group: root},
		},
		metadata: fakeAnimeHydrator{items: []anilist.Anime{{
			ID: root.AniListID, MALID: root.MALID,
			Title: anilist.Titles{English: "AniList title"}, CoverImage: "https://example.com/anilist.jpg",
		}}},
	}

	grouped, err := grouper.Group(context.Background(), []domain.Anime{{MalID: root.MALID, TitleEnglish: "Provider title"}})
	if err != nil {
		t.Fatalf("group cards: %v", err)
	}
	if len(grouped) != 1 || grouped[0].AniListID != root.AniListID || grouped[0].DisplayTitle() != "AniList title" {
		t.Fatalf("MAL-only card was not hydrated from AniList: %+v", grouped)
	}
}

func TestCardGrouperInfersUnmappedSequelAndParentSpecial(t *testing.T) {
	group := mappingGroup{MediaType: "tv", TMDBID: 82684}
	root := animeMapping{AniListID: 101280, MALID: 37430, Group: group, Season: 1}
	seasonThree := animeMapping{AniListID: 156822, MALID: 53580, Group: group, Season: 3}
	seasonFourIdentity := mappingIdentity{AniListID: 182205, MALID: 59970}
	onaIdentity := mappingIdentity{AniListID: 146503, MALID: 51309}
	resolver := &fakeSavingResolver{fakeMappingResolver: fakeMappingResolver{
		resolved: map[mappingIdentity]animeMapping{
			{AniListID: root.AniListID, MALID: root.MALID}:               root,
			{AniListID: seasonThree.AniListID, MALID: seasonThree.MALID}: seasonThree,
		},
		canonical: map[mappingGroup]animeMapping{group: root},
	}}
	grouper := &CardGrouper{
		mappings: resolver,
		metadata: fakeAnimeHydrator{items: []anilist.Anime{{
			ID: root.AniListID, MALID: root.MALID, Title: anilist.Titles{English: "Slime"},
		}}},
	}
	input := []domain.Anime{
		{AniListID: root.AniListID, MalID: root.MALID, Type: "TV", TitleEnglish: "Slime"},
		{AniListID: seasonFourIdentity.AniListID, MalID: seasonFourIdentity.MALID, Type: "TV", ProviderRelations: []domain.AnimeProviderRelation{{Type: "PREQUEL", Format: "TV", AniListID: seasonThree.AniListID, MALID: seasonThree.MALID}}},
		{AniListID: onaIdentity.AniListID, MalID: onaIdentity.MALID, Type: "ONA", ProviderRelations: []domain.AnimeProviderRelation{{Type: "PARENT", Format: "TV", AniListID: root.AniListID, MALID: root.MALID}}},
		{AniListID: 182206, MalID: 59971, Type: "MOVIE", TitleEnglish: "Tears of the Azure Sea", ProviderRelations: []domain.AnimeProviderRelation{{Type: "PARENT", Format: "TV", AniListID: root.AniListID, MALID: root.MALID}}},
	}

	grouped, err := grouper.Group(context.Background(), input)
	if err != nil {
		t.Fatalf("group cards: %v", err)
	}
	if len(grouped) != 2 || grouped[0].MalID != root.MALID || grouped[1].MalID != 59971 {
		t.Fatalf("unexpected fallback grouping: %+v", grouped)
	}
	if len(resolver.saved) != 2 {
		t.Fatalf("saved %d inferred mappings, want 2", len(resolver.saved))
	}
}
