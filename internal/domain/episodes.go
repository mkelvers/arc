package domain

import "context"

type EpisodeAvailability struct {
	Sub []int
	Dub []int
}

type EpisodeAvailabilityProvider interface {
	Name() string
	ResolveEpisodeProviderID(ctx context.Context, animeID int, titleCandidates []string) (string, error)
	GetEpisodeAvailabilityByProviderID(ctx context.Context, providerID string) (EpisodeAvailability, error)
}

type CanonicalEpisode struct {
	Number  int    `json:"number"`
	Title   string `json:"title"`
	HasSub  bool   `json:"has_sub"`
	HasDub  bool   `json:"has_dub"`
	SubOnly bool   `json:"sub_only"`
	Filler  bool   `json:"filler"`
	Recap   bool   `json:"recap"`
}

type CanonicalEpisodeList struct {
	AnimeID       int                `json:"anime_id"`
	Episodes      []CanonicalEpisode `json:"episodes"`
	Source        string             `json:"source"`
	NextRefreshAt string             `json:"next_refresh_at,omitempty"`
}

type EpisodeService interface {
	GetCanonicalEpisodes(ctx context.Context, anime Anime, forceRefresh bool) (CanonicalEpisodeList, error)
	RefreshTrackedDue(ctx context.Context, limit int) error
}
