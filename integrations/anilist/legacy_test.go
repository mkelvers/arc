package anilist

import "testing"

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
