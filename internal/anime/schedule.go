package anime

import (
	"context"
	"fmt"
	"mal/integrations/animeschedule"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type cachedWeekSchedule struct {
	fetchedAt time.Time
	value     animeschedule.WeekSchedule
}

func parseYearWeek(c *gin.Context) (int, int) {
	year, _ := strconv.Atoi(c.Query("year"))
	week, _ := strconv.Atoi(c.Query("week"))
	if year <= 0 || week <= 0 {
		now := time.Now()
		y, w := now.ISOWeek()
		if year <= 0 {
			year = y
		}
		if week <= 0 {
			week = w
		}
	}
	return year, week
}

func scheduleTimezone(c *gin.Context) string {
	timezone := strings.TrimSpace(c.Query("timezone"))
	if timezone == "" {
		return "UTC"
	}
	return timezone
}

func (h *AnimeHandler) getCachedAnimeScheduleWeek(ctx context.Context, year int, week int, timezone string) (animeschedule.WeekSchedule, error) {
	cacheKey := fmt.Sprintf("%d-%02d-%s", year, week, timezone)
	const ttl = 10 * time.Minute

	h.scheduleCacheMu.Lock()
	cached, ok := h.scheduleCache[cacheKey]
	h.scheduleCacheMu.Unlock()

	if ok && time.Since(cached.fetchedAt) < ttl {
		return cached.value, nil
	}

	value, err := animeschedule.FetchWeek(ctx, nil, year, week, timezone)
	if err != nil {
		return animeschedule.WeekSchedule{}, err
	}

	h.scheduleCacheMu.Lock()
	h.scheduleCache[cacheKey] = cachedWeekSchedule{fetchedAt: time.Now(), value: value}
	h.scheduleCacheMu.Unlock()

	return value, nil
}

type scheduleDayView struct {
	DateLabel    string
	WeekdayLabel string
	Entries      []animeschedule.Entry
}

func buildScheduleDays(schedule animeschedule.WeekSchedule, year int, week int) []scheduleDayView {
	start := isoWeekStartMonday(year, week)
	order := []time.Weekday{time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday, time.Saturday, time.Sunday}
	out := make([]scheduleDayView, 0, 7)
	for i, wd := range order {
		date := start.AddDate(0, 0, i)
		entries := schedule.Days[wd]
		sort.SliceStable(entries, func(i, j int) bool {
			if !entries[i].AirsAt.IsZero() && !entries[j].AirsAt.IsZero() {
				return entries[i].AirsAt.Before(entries[j].AirsAt)
			}
			return localTimeMinutes(entries[i].LocalTime) < localTimeMinutes(entries[j].LocalTime)
		})
		out = append(out, scheduleDayView{
			DateLabel:    strings.ToUpper(date.Format("02 Jan")),
			WeekdayLabel: wd.String(),
			Entries:      entries,
		})
	}
	return out
}

func localTimeMinutes(localTime string) int {
	for _, layout := range []string{"15:04", "03:04 PM"} {
		t, err := time.Parse(layout, localTime)
		if err == nil {
			return t.Hour()*60 + t.Minute()
		}
	}
	return 0
}

func isoWeekStartMonday(year int, week int) time.Time {
	// ISO week 1 is the week with the year's first Thursday in it.
	jan4 := time.Date(year, 1, 4, 12, 0, 0, 0, time.Local)
	// Move back to Monday
	offset := int(time.Monday - jan4.Weekday())
	if offset > 0 {
		offset -= 7
	}
	week1Monday := jan4.AddDate(0, 0, offset)
	return week1Monday.AddDate(0, 0, (week-1)*7)
}

func adjacentISOWeek(year int, week int, deltaWeeks int) (int, int) {
	target := isoWeekStartMonday(year, week).AddDate(0, 0, deltaWeeks*7)
	return target.ISOWeek()
}
