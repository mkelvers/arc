package watchlist

import (
	"strings"
	"time"

	"mal/internal/domain"
)

type publicWatchlist struct {
	SchemaVersion string                 `json:"schema_version"`
	GeneratedAt   time.Time              `json:"generated_at"`
	UserID        string                 `json:"user_id"`
	Summary       watchlistSummary       `json:"summary"`
	Entries       []publicWatchlistEntry `json:"entries"`
}

type watchlistSummary struct {
	Total       int `json:"total"`
	Watching    int `json:"watching"`
	Completed   int `json:"completed"`
	PlanToWatch int `json:"plan_to_watch"`
	OnHold      int `json:"on_hold"`
	Dropped     int `json:"dropped"`
}

type publicWatchlistEntry struct {
	MALID                  int64             `json:"mal_id"`
	Status                 string            `json:"status"`
	AddedAt                time.Time         `json:"added_at"`
	CompletedAt            *time.Time        `json:"completed_at"`
	CompletionDateAccuracy *string           `json:"completion_date_accuracy"`
	LastWatchedAt          *time.Time        `json:"last_watched_at"`
	Progress               watchlistProgress `json:"progress"`
	Titles                 watchlistTitles   `json:"titles"`
}

type watchlistProgress struct {
	CurrentEpisode     *int64   `json:"current_episode"`
	CurrentTimeSeconds *float64 `json:"current_time_seconds"`
}

type watchlistTitles struct {
	Preferred string  `json:"preferred"`
	Original  string  `json:"original"`
	English   *string `json:"english"`
	Japanese  *string `json:"japanese"`
}

func newPublicWatchlist(userID string, rows []domain.UserWatchListRow, generatedAt time.Time) publicWatchlist {
	export := publicWatchlist{
		SchemaVersion: "1.0",
		GeneratedAt:   generatedAt,
		UserID:        userID,
		Entries:       make([]publicWatchlistEntry, 0, len(rows)),
	}

	for _, row := range rows {
		export.Summary.add(row.Status)
		export.Entries = append(export.Entries, newPublicWatchlistEntry(row))
	}

	return export
}

func (s *watchlistSummary) add(status string) {
	s.Total++
	switch status {
	case "watching":
		s.Watching++
	case "completed":
		s.Completed++
	case "plan_to_watch":
		s.PlanToWatch++
	case "on_hold":
		s.OnHold++
	case "dropped":
		s.Dropped++
	}
}

func newPublicWatchlistEntry(row domain.UserWatchListRow) publicWatchlistEntry {
	currentEpisode := nullableInt64(row.CurrentEpisode.Int64, row.CurrentEpisode.Valid)
	currentTimeSeconds := nullableFloat64(row.CurrentTimeSeconds, row.CurrentEpisode.Valid)
	lastWatchedAt := nullableTime(row.LastEpisodeAt.Time, row.LastEpisodeAt.Valid)
	if row.PlaybackCurrentEpisode.Valid {
		currentEpisode = &row.PlaybackCurrentEpisode.Int64
		currentTimeSeconds = nullableFloat64(row.PlaybackCurrentTimeSeconds.Float64, row.PlaybackCurrentTimeSeconds.Valid)
		lastWatchedAt = nullableTime(row.PlaybackUpdatedAt.Time, row.PlaybackUpdatedAt.Valid)
	}

	entry := publicWatchlistEntry{
		MALID:         row.AnimeID,
		Status:        row.Status,
		AddedAt:       row.CreatedAt,
		LastWatchedAt: lastWatchedAt,
		Progress: watchlistProgress{
			CurrentEpisode:     currentEpisode,
			CurrentTimeSeconds: currentTimeSeconds,
		},
		Titles: watchlistTitles{
			Preferred: row.DisplayTitle(),
			Original:  row.TitleOriginal,
			English:   nullableString(row.TitleEnglish.String, row.TitleEnglish.Valid),
			Japanese:  nullableString(row.TitleJapanese.String, row.TitleJapanese.Valid),
		},
	}

	if row.Status == "completed" {
		accuracy := "exact"
		if row.CompletedAt.Valid {
			entry.CompletedAt = &row.CompletedAt.Time
			if row.CompletedAtEstimated {
				accuracy = "estimated_from_historical_update"
			}
		} else {
			entry.CompletedAt = &row.UpdatedAt
			accuracy = "estimated_from_historical_update"
		}
		entry.CompletionDateAccuracy = &accuracy
	}

	return entry
}

func nullableString(value string, valid bool) *string {
	if !valid || strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func nullableInt64(value int64, valid bool) *int64 {
	if !valid {
		return nil
	}
	return &value
}

func nullableFloat64(value float64, valid bool) *float64 {
	if !valid {
		return nil
	}
	return &value
}

func nullableTime(value time.Time, valid bool) *time.Time {
	if !valid {
		return nil
	}
	return &value
}
