package service

import (
	"database/sql"
	"log/slog"
	"strings"
	"time"

	"mal/internal/domain"
)

const (
	retryInterval                 = 15 * time.Minute
	retryWindow                   = 3 * time.Hour
	airingFallbackRefreshInterval = 6 * time.Hour
)

func nextRefreshAt(anime domain.Anime, now time.Time) sql.NullTime {
	if !anime.Airing {
		return sql.NullTime{}
	}

	// During the hours immediately following a broadcast time, providers can lag.
	// Keep retrying for a short window, even if the provider request succeeded.
	lastBroadcast := nextBroadcastBeforeOrAt(anime, now)
	if !lastBroadcast.IsZero() && now.Before(lastBroadcast.Add(retryWindow)) {
		return sql.NullTime{Time: now.Add(retryInterval).UTC(), Valid: true}
	}

	next := nextBroadcastAfter(anime, now)
	if !next.IsZero() {
		return sql.NullTime{Time: next, Valid: true}
	}

	// Broadcast metadata is often missing or wrong for currently airing shows.
	// Avoid "never refresh again" caches by falling back to a fixed interval.
	return sql.NullTime{Time: now.Add(airingFallbackRefreshInterval).UTC(), Valid: true}
}

func nextRetryTime(anime domain.Anime, now time.Time) time.Time {
	broadcast := nextBroadcastBeforeOrAt(anime, now)
	if broadcast.IsZero() || now.After(broadcast.Add(retryWindow)) {
		return nextBroadcastAfter(anime, now)
	}
	return now.Add(retryInterval)
}

func nextBroadcastBeforeOrAt(anime domain.Anime, now time.Time) time.Time {
	next := nextBroadcastAfter(anime, now.AddDate(0, 0, -7))
	if next.IsZero() || next.After(now) {
		return time.Time{}
	}
	return next
}

func nextBroadcastAfter(anime domain.Anime, after time.Time) time.Time {
	day := weekdayFromProvider(anime.Broadcast.Day)
	if day < 0 || strings.TrimSpace(anime.Broadcast.Time) == "" {
		return time.Time{}
	}

	loc := time.UTC
	if tz := strings.TrimSpace(anime.Broadcast.Timezone); tz != "" {
		if loaded, err := time.LoadLocation(tz); err == nil {
			loc = loaded
		} else {
			slog.Warn("episodes_broadcast_timezone_parse_failed", "component", "episodes", "fields", map[string]any{
				"anime_id": anime.MalID,
				"timezone": tz,
			}, "error", err)
		}
	}

	hour, minute, ok := parseBroadcastTime(anime.Broadcast.Time)
	if !ok {
		slog.Warn("episodes_broadcast_time_parse_failed", "component", "episodes", "fields", map[string]any{
			"anime_id": anime.MalID,
			"time":     anime.Broadcast.Time,
		})

		return time.Time{}
	}

	localAfter := after.In(loc)
	daysAhead := (int(day) - int(localAfter.Weekday()) + 7) % 7
	candidate := time.Date(localAfter.Year(), localAfter.Month(), localAfter.Day()+daysAhead, hour, minute, 0, 0, loc)
	if !candidate.After(localAfter) {
		candidate = candidate.AddDate(0, 0, 7)
	}
	return candidate.UTC()
}

func weekdayFromProvider(day string) time.Weekday {
	switch strings.ToLower(strings.TrimSpace(day)) {
	case "sundays":
		return time.Sunday
	case "mondays":
		return time.Monday
	case "tuesdays":
		return time.Tuesday
	case "wednesdays":
		return time.Wednesday
	case "thursdays":
		return time.Thursday
	case "fridays":
		return time.Friday
	case "saturdays":
		return time.Saturday
	default:
		return -1
	}
}

func parseBroadcastTime(value string) (int, int, bool) {
	t, err := time.Parse("15:04", strings.TrimSpace(value))
	if err != nil {
		return 0, 0, false
	}
	return t.Hour(), t.Minute(), true
}
