package metadata

import "sort"

type Genre struct {
	ID   int
	Name string
}

var genreNames = map[int]string{
	1: "Action", 2: "Adventure", 3: "Cars", 4: "Comedy", 6: "Demons", 7: "Mystery",
	8: "Drama", 9: "Ecchi", 10: "Fantasy", 11: "Game", 13: "Historical", 14: "Horror",
	15: "Kids", 16: "Martial Arts", 17: "Mecha", 18: "Music", 19: "Parody", 20: "Samurai",
	21: "Romance", 22: "School", 23: "Shoujo", 25: "Shounen", 27: "Space", 28: "Sports",
	29: "Super Power", 30: "Vampire", 35: "Harem", 36: "Slice of Life", 37: "Supernatural",
	38: "Military", 39: "Police", 40: "Psychological", 41: "Seinen", 42: "Josei",
}

func Genres() []Genre {
	genres := make([]Genre, 0, len(genreNames))
	for id, name := range genreNames {
		genres = append(genres, Genre{ID: id, Name: name})
	}
	sort.Slice(genres, func(i, j int) bool { return genres[i].ID < genres[j].ID })
	return genres
}

func GenreName(id int) (string, bool) {
	name, ok := genreNames[id]
	return name, ok
}
