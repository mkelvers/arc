package anilist

import (
	"mal/integrations/metadata"
	"testing"
)

func TestToMetadataAnimeMapsAniListMetadata(t *testing.T) {
	anime := Anime{
		MALID:           20,
		Title:           Titles{Romaji: "NARUTO", English: "Naruto"},
		Status:          "RELEASING",
		Episodes:        220,
		DurationMinutes: 23,
		AverageScore:    80,
		Favourites:      100,
		ScoreCount:      200,
		Rank:            12,
		Season:          "FALL",
		SeasonYear:      2002,
		StartDate:       Date{Year: 2002, Month: 10, Day: 3},
	}
	got := ToMetadataAnime(anime)
	if got.MalID != 20 || got.DisplayTitle() != "Naruto" || got.Status != "Currently Airing" || !got.Airing {
		t.Fatalf("mapped anime = %+v", got)
	}
	if got.Score != 8 || got.Duration != "23 min per ep" || got.Aired.From != "2002-10-03T00:00:00Z" {
		t.Fatalf("mapped details = %+v", got)
	}
}

func TestToMetadataAnimeNormalizesDescription(t *testing.T) {
	got := ToMetadataAnime(Anime{Description: "A story.<br><br><i>Source:</i> Anime News Network &amp; friends."})

	if got.Synopsis != "A story.\nSource: Anime News Network & friends." {
		t.Fatalf("Synopsis = %q", got.Synopsis)
	}
}

func TestToMetadataAnimeMapsSidebarMetadata(t *testing.T) {
	anime := Anime{
		MALID:           20,
		Source:          "LIGHT_NOVEL",
		DurationMinutes: 24,
		MeanScore:       86,
		Popularity:      1234,
		Favourites:      56,
		Rank:            3,
		RankLabel:       "Highest Rated All Time",
		Genres:          []string{"Action", "Fantasy"},
		Studios:         []Studio{{ID: 4, Name: "bones"}},
		Producers:       []Producer{{Name: "Producer One"}},
		Tags: []Tag{
			{ID: 1, Name: "Lower", Rank: 40},
			{ID: 2, Name: "Spoiler", Rank: 100, IsGeneralSpoiler: true},
			{ID: 4, Name: "Media spoiler", Rank: 95, IsMediaSpoiler: true},
			{ID: 3, Name: "Higher", Rank: 90},
		},
	}

	got := ToMetadataAnime(anime)
	checkSidebarScalars(t, got)
	checkSidebarEntities(t, got)
	checkSidebarTags(t, got)
}

func checkSidebarScalars(t *testing.T, anime metadata.Anime) {
	t.Helper()
	if anime.Source != "Light novel" || anime.MeanScore != 8.6 || anime.Popularity != 1234 || anime.RankLabel != "Highest Rated All Time" {
		t.Fatalf("sidebar scalar fields = %+v", anime)
	}
}

func checkSidebarEntities(t *testing.T, anime metadata.Anime) {
	t.Helper()
	if len(anime.Studios) != 1 || anime.Studios[0].MalID != 4 || len(anime.Producers) != 1 || anime.Producers[0].Name != "Producer One" {
		t.Fatalf("sidebar entities = %+v", anime)
	}
}

func checkSidebarTags(t *testing.T, anime metadata.Anime) {
	t.Helper()
	if len(anime.Tags) != 2 || anime.Tags[0].Name != "Higher" || anime.Tags[1].Name != "Lower" || anime.Tags[0].MalID != 3 {
		t.Fatalf("safe tags = %+v", anime.Tags)
	}
	if anime.Genres[0].MalID == 0 || anime.Genres[1].MalID == 0 {
		t.Fatalf("genres did not receive filter IDs = %+v", anime.Genres)
	}
}
