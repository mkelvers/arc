package domain

import (
	"context"
	"mal/internal/db"
)

type playbackSourceRefreshKey struct{}
type deferredPlaybackDataKey struct{}

func WithDeferredPlaybackData(ctx context.Context) context.Context {
	return context.WithValue(ctx, deferredPlaybackDataKey{}, true)
}

func PlaybackDataDeferred(ctx context.Context) bool {
	deferred, _ := ctx.Value(deferredPlaybackDataKey{}).(bool)
	return deferred
}

func WithPlaybackSourceRefresh(ctx context.Context) context.Context {
	return context.WithValue(ctx, playbackSourceRefreshKey{}, true)
}

func PlaybackSourceRefreshRequested(ctx context.Context) bool {
	refresh, _ := ctx.Value(playbackSourceRefreshKey{}).(bool)
	return refresh
}

type PlaybackService interface {
	BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (WatchPageData, error)
	SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error
	CompleteAnime(ctx context.Context, userID string, animeID int64) error
	SignProxyToken(targetURL, referer, scope string) (string, error)
	ResolveProxyToken(token string, scope string) (string, string, error)
	UpsertSkipSegmentOverride(ctx context.Context, userID string, animeID int64, episode int, skipType string, startTime, endTime float64) error
}

type WatchPageData struct {
	WatchData                  WatchData
	Anime                      Anime
	Episodes                   []CanonicalEpisode
	CurrentEpID                string
	WatchlistStatus            string
	WatchlistIDs               []int64
	Seasons                    []SeasonEntry
	User                       *User
	CurrentPath                string
	Error                      string
	EpisodeAvailabilityWarning string
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
	Airing           bool
}

type SubtitleItem struct {
	Lang  string `json:"lang"`
	Token string `json:"token"`
}

type ModeSource struct {
	Token     string         `json:"token"`
	Type      string         `json:"type,omitempty"`
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
	InTx(ctx context.Context, fn func(ctx context.Context, repo PlaybackRepository) error) error
	UpsertAnime(ctx context.Context, params db.UpsertAnimeParams) (db.Anime, error)
	GetAnime(ctx context.Context, id int64) (db.Anime, error)
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
