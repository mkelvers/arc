package domain

import "context"

type EpisodeAvailability struct {
	Sub    []int
	Dub    []int
	Titles map[int]string
}

type EpisodeProvider interface {
	Name() string
	ResolveEpisodeProviderID(ctx context.Context, animeID int, titleCandidates []string) (string, error)
}

type EpisodeAvailabilityProvider interface {
	EpisodeProvider
	GetEpisodeAvailabilityByProviderID(ctx context.Context, providerID string) (EpisodeAvailability, error)
}

type EpisodeTitleProvider interface {
	EpisodeProvider
	GetEpisodeTitlesByProviderID(ctx context.Context, providerID string) (map[int]string, error)
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
	AnimeID             int                `json:"anime_id"`
	Episodes            []CanonicalEpisode `json:"episodes"`
	Source              string             `json:"source"`
	AvailabilityVersion int                `json:"availability_version,omitempty"`
	ReleaseChecked      bool               `json:"release_checked,omitempty"`
	NextRefreshAt       string             `json:"next_refresh_at,omitempty"`
	RetryUntilAt        string             `json:"retry_until_at,omitempty"`
	LastAttemptAt       string             `json:"last_attempt_at,omitempty"`
	LastSuccessAt       string             `json:"last_success_at,omitempty"`
	FailureCount        int64              `json:"failure_count,omitempty"`
}

type EpisodeService interface {
	GetCanonicalEpisodes(ctx context.Context, anime Anime, forceRefresh bool) (CanonicalEpisodeList, error)
	RefreshTrackedDue(ctx context.Context, limit int) error
}

type EpisodeTitleService interface {
	EnrichEpisodeTitles(ctx context.Context, anime Anime) (CanonicalEpisodeList, error)
}
