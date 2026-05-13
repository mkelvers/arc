package domain

import (
	"context"
	"mal/internal/db"
)

type PlaybackService interface {
	BuildWatchData(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string, userID string) (map[string]any, error)
	SaveProgress(ctx context.Context, userID string, animeID int64, episode int, timeSeconds float64) error
	ResolveProxyToken(token string) (string, string, error)
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
	UpsertContinueWatchingEntry(ctx context.Context, params db.UpsertContinueWatchingEntryParams) (db.ContinueWatchingEntry, error)
}
