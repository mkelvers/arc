package domain

import (
	"context"
	"strconv"
)

type EpisodeAvailability struct {
	Sub    []string
	Dub    []string
	Titles map[string]string
}

type EpisodeProvider interface {
	Name() string
	ResolveEpisodeProviderID(ctx context.Context, animeID int, titleCandidates []string) (string, error)
}

type EpisodeAvailabilityProvider interface {
	EpisodeProvider
	GetEpisodeAvailabilityByProviderID(ctx context.Context, providerID string) (EpisodeAvailability, error)
}

type CanonicalEpisode struct {
	Number  int    `json:"number"`
	ID      string `json:"id,omitempty"`
	Label   string `json:"label,omitempty"`
	Order   int    `json:"order,omitempty"`
	Special bool   `json:"special,omitempty"`
	AnimeID int    `json:"-"`
	Current bool   `json:"-"`
	Title   string `json:"title"`
	HasSub  bool   `json:"has_sub"`
	HasDub  bool   `json:"has_dub"`
	SubOnly bool   `json:"sub_only"`
	Filler  bool   `json:"filler"`
	Recap   bool   `json:"recap"`
}

func (e CanonicalEpisode) PlaybackID() string {
	if e.ID != "" {
		return e.ID
	}
	return strconv.Itoa(e.Number)
}

func (e CanonicalEpisode) DisplayLabel() string {
	if e.Label != "" {
		return e.Label
	}
	return strconv.Itoa(e.Number)
}

func (e CanonicalEpisode) SortOrder() int {
	if e.Order > 0 {
		return e.Order
	}
	return e.Number * 10
}

func RegularEpisodeCount(episodes []CanonicalEpisode) int {
	count := 0
	for _, episode := range episodes {
		if !episode.Special {
			count++
		}
	}
	return count
}

type CanonicalEpisodeList struct {
	AnimeID               int                `json:"anime_id"`
	Episodes              []CanonicalEpisode `json:"episodes"`
	Source                string             `json:"source"`
	AvailabilityVersion   int                `json:"availability_version,omitempty"`
	ClassificationChecked bool               `json:"classification_checked,omitempty"`
	ReleaseChecked        bool               `json:"release_checked,omitempty"`
	NextRefreshAt         string             `json:"next_refresh_at,omitempty"`
	RetryUntilAt          string             `json:"retry_until_at,omitempty"`
	LastAttemptAt         string             `json:"last_attempt_at,omitempty"`
	LastSuccessAt         string             `json:"last_success_at,omitempty"`
	FailureCount          int64              `json:"failure_count,omitempty"`
}

type EpisodeService interface {
	GetCanonicalEpisodes(ctx context.Context, anime Anime, forceRefresh bool) (CanonicalEpisodeList, error)
	GetCachedCanonicalEpisodes(ctx context.Context, anime Anime) (CanonicalEpisodeList, bool)
	RefreshTrackedDue(ctx context.Context, limit int) error
}

type EpisodeClassificationService interface {
	EnrichEpisodeClassifications(ctx context.Context, anime Anime) (CanonicalEpisodeList, error)
}
