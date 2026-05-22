package domain

import (
	"context"
	"mal/internal/db"
)

type PlaybackService interface {
	BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (WatchPageData, error)
	SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error
	CompleteAnime(ctx context.Context, userID string, animeID int64) error
	ResolveProxyToken(token string) (string, string, error)
	UpsertSkipSegmentOverride(ctx context.Context, userID string, animeID int64, episode int, skipType string, startTime, endTime float64) error
}

type WatchPageData struct {
	WatchData       WatchData
	Anime           Anime
	Episodes        []CanonicalEpisode
	CurrentEpID     string
	WatchlistStatus string
	WatchlistIDs    []int64
	Seasons         []SeasonEntry
	User            *User
	CurrentPath     string
	Error           string
}

type WatchData struct {
	MalID            int
	Title            string
	CurrentEpisode   string
	StartTimeSeconds float64
	Episodes         []CanonicalEpisode
	Providers        []ProviderData
	ModeSources      map[string]ModeSource
	InitialMode      string
	ModeSwitchedFrom string
	AvailableModes   []string
	Segments         []SkipSegment
}

type SubtitleItem struct {
	Lang    string `json:"lang"`
	URL     string `json:"url,omitempty"`
	Referer string `json:"referer,omitempty"`
	Token   string `json:"token"`
}

type ModeSource struct {
	URL       string         `json:"url,omitempty"`
	Referer   string         `json:"referer,omitempty"`
	Token     string         `json:"token"`
	Subtitles []SubtitleItem `json:"subtitles"`
	Qualities []string       `json:"qualities,omitempty"`
}

type SeasonEntry struct {
	MalID     int    `json:"mal_id"`
	Title     string `json:"title"`
	Prefix    string `json:"prefix"`
	IsCurrent bool   `json:"is_current"`
}

type SkipSegment struct {
	Type   string  `json:"type"`
	Start  float64 `json:"start"`
	End    float64 `json:"end"`
	Source string  `json:"source,omitempty"`
}

type ProviderStream struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	Quality   string `json:"quality"`
	MalID     int    `json:"mal_id"`
	IsCurrent bool   `json:"is_current"`
}

type ProviderData struct {
	Streams []ProviderStream `json:"streams"`
}

type EpisodeData struct {
	MalID    int    `json:"mal_id"`
	Title    string `json:"title"`
	IsFiller bool   `json:"is_filler"`
	IsRecap  bool   `json:"is_recap"`
}

type PlaybackRepository interface {
	GetWatchListEntry(ctx context.Context, params db.GetWatchListEntryParams) (db.WatchListEntry, error)
	GetContinueWatchingEntry(ctx context.Context, params db.GetContinueWatchingEntryParams) (db.ContinueWatchingEntry, error)
	SaveWatchProgress(ctx context.Context, params db.SaveWatchProgressParams) error
	UpsertWatchListEntry(ctx context.Context, params db.UpsertWatchListEntryParams) (db.WatchListEntry, error)
	UpsertContinueWatchingEntry(ctx context.Context, params db.UpsertContinueWatchingEntryParams) (db.ContinueWatchingEntry, error)
	DeleteContinueWatchingEntry(ctx context.Context, params db.DeleteContinueWatchingEntryParams) error
	ListSkipSegmentOverrides(ctx context.Context, userID string, animeID int64, episode int64) ([]db.SkipSegmentOverrideRow, error)
	UpsertSkipSegmentOverride(ctx context.Context, r db.SkipSegmentOverrideRow) error
	HasSkipSegmentOverrideTable(ctx context.Context) (bool, error)
}
