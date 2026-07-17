package tmdb

// MediaType identifies the TMDB catalogue a mapped anime belongs to.
type MediaType string

const (
	MediaTypeTV    MediaType = "tv"
	MediaTypeMovie MediaType = "movie"
)

type MediaRef struct {
	Type MediaType
	ID   int64
}

type ImageOptions struct {
	Language              string
	IncludeImageLanguages []string
}

type Image struct {
	AspectRatio float64 `json:"aspect_ratio"`
	FilePath    string  `json:"file_path"`
	Height      int     `json:"height"`
	Language    string  `json:"iso_639_1"`
	VoteAverage float64 `json:"vote_average"`
	VoteCount   int     `json:"vote_count"`
	Width       int     `json:"width"`
}

type Images struct {
	ID        int64   `json:"id"`
	Backdrops []Image `json:"backdrops"`
	Logos     []Image `json:"logos"`
}

type Media struct {
	ID           int64
	Type         MediaType
	Name         string
	OriginalName string
	Overview     string
	BackdropPath string
	PosterPath   string
	Seasons      []SeasonSummary
	Backdrops    []Image
	Logos        []Image
}

type SearchResult struct {
	ID            int64     `json:"id"`
	Type          MediaType `json:"-"`
	Name          string    `json:"name"`
	OriginalName  string    `json:"original_name"`
	Title         string    `json:"title"`
	OriginalTitle string    `json:"original_title"`
	Overview      string    `json:"overview"`
	BackdropPath  string    `json:"backdrop_path"`
	PosterPath    string    `json:"poster_path"`
	ReleaseDate   string    `json:"release_date"`
	FirstAirDate  string    `json:"first_air_date"`
}

type SeasonSummary struct {
	AirDate      string `json:"air_date"`
	EpisodeCount int    `json:"episode_count"`
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Overview     string `json:"overview"`
	PosterPath   string `json:"poster_path"`
	SeasonNumber int    `json:"season_number"`
}

type Episode struct {
	AirDate        string  `json:"air_date"`
	EpisodeNumber  int     `json:"episode_number"`
	EpisodeType    string  `json:"episode_type"`
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	Order          int     `json:"order"`
	Overview       string  `json:"overview"`
	ProductionCode string  `json:"production_code"`
	Runtime        int     `json:"runtime"`
	SeasonNumber   int     `json:"season_number"`
	ShowID         int64   `json:"show_id"`
	StillPath      string  `json:"still_path"`
	VoteAverage    float64 `json:"vote_average"`
	VoteCount      int     `json:"vote_count"`
}

type Season struct {
	AirDate      string    `json:"air_date"`
	Episodes     []Episode `json:"episodes"`
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Overview     string    `json:"overview"`
	PosterPath   string    `json:"poster_path"`
	SeasonNumber int       `json:"season_number"`
}

// SeasonMetadataMatch describes the known shape of one independently released
// anime season. The season and episode range are mapping hints; count, date, and
// titles describe the release itself.
type SeasonMetadataMatch struct {
	SeasonNumber  int
	EpisodeMin    int
	EpisodeMax    int
	EpisodeCount  int
	FirstAirDate  string
	EpisodeTitles []string
}

type EpisodeGroupSummary struct {
	Description  string  `json:"description"`
	EpisodeCount int     `json:"episode_count"`
	GroupCount   int     `json:"group_count"`
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Network      Network `json:"network"`
	Type         int     `json:"type"`
}

type Network struct {
	ID            int64  `json:"id"`
	LogoPath      string `json:"logo_path"`
	Name          string `json:"name"`
	OriginCountry string `json:"origin_country"`
}

type EpisodeGroups struct {
	ID      int64                 `json:"id"`
	Results []EpisodeGroupSummary `json:"results"`
}

type EpisodeGroup struct {
	Description  string         `json:"description"`
	EpisodeCount int            `json:"episode_count"`
	GroupCount   int            `json:"group_count"`
	Groups       []EpisodeBlock `json:"groups"`
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Network      Network        `json:"network"`
	Type         int            `json:"type"`
}

type EpisodeBlock struct {
	Episodes []Episode `json:"episodes"`
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Order    int       `json:"order"`
}
