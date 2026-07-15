package domain

import "testing"

func TestAnimeSeasonNumber(t *testing.T) {
	tests := []struct {
		name     string
		anime    Anime
		fallback int
		want     int
	}{
		{
			name:     "ordinal sequel",
			anime:    Anime{TitleEnglish: "Frieren: Beyond Journey's End 2nd Season"},
			fallback: 1,
			want:     2,
		},
		{
			name:     "numbered split cour",
			anime:    Anime{TitleEnglish: "That Time I Got Reincarnated as a Slime Season 2 Part 2"},
			fallback: 2,
			want:     2,
		},
		{
			name:     "unnumbered split cour",
			anime:    Anime{TitleEnglish: "Example Anime Part 2"},
			fallback: 3,
			want:     3,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := test.anime.SeasonNumber(test.fallback); got != test.want {
				t.Fatalf("SeasonNumber(%d) = %d, want %d", test.fallback, got, test.want)
			}
		})
	}
}
