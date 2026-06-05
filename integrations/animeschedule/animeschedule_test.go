package animeschedule

import (
	"strings"
	"testing"
	"time"

	"github.com/PuerkitoBio/goquery"
)

func TestParseLocalTimeUsesRequestedTimezone(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(`
		<h3 class="time-bar">
			<span class="show-episode">Ep 9</span>
			<time datetime="2026-06-05T16:00+01:00" class="show-air-time">04:00 PM</time>
			<span>SUB</span>
		</h3>
	`))
	if err != nil {
		t.Fatalf("parse document: %v", err)
	}

	location, err := time.LoadLocation("Europe/Copenhagen")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}

	localTime, airsAt, _, rendered := parseLocalTime(doc.Find(".time-bar").First(), location)

	if localTime != "17:00" {
		t.Fatalf("localTime = %q, want %q", localTime, "17:00")
	}
	if rendered != "04:00 PM" {
		t.Fatalf("rendered = %q, want %q", rendered, "04:00 PM")
	}
	if airsAt.Location().String() != "Europe/Copenhagen" {
		t.Fatalf("airsAt location = %q, want Europe/Copenhagen", airsAt.Location().String())
	}
}

func TestParseLocalTimeUsesExactAngelNextDoorSubRelease(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(`
		<h3 class="time-bar">
			<span class="show-episode">Ep 10</span>
			<time datetime="2026-06-05T15:30+01:00" class="show-air-time">03:30 PM</time>
			<span>SUB</span>
		</h3>
	`))
	if err != nil {
		t.Fatalf("parse document: %v", err)
	}

	location, err := time.LoadLocation("Europe/Copenhagen")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}

	localTime, _, _, _ := parseLocalTime(doc.Find(".time-bar").First(), location)

	if localTime != "16:30" {
		t.Fatalf("localTime = %q, want %q", localTime, "16:30")
	}
}

func TestPreferredReleaseEntriesPrefersSubForSameEpisode(t *testing.T) {
	entries := []Entry{
		{
			Title:       "Tensei shitara Slime Datta Ken 4th Season",
			AnimeURL:    "https://animeschedule.net/anime/tensei-shitara-slime-datta-ken-4th-season",
			EpisodeText: "Ep 9",
			AirType:     AirTypeJPN,
			LocalTime:   "16:00",
		},
		{
			Title:       "Tensei shitara Slime Datta Ken 4th Season",
			AnimeURL:    "https://animeschedule.net/anime/tensei-shitara-slime-datta-ken-4th-season",
			EpisodeText: "Ep 9",
			AirType:     AirTypeSUB,
			LocalTime:   "17:00",
		},
		{
			Title:       "Tensei shitara Slime Datta Ken 4th Season",
			AnimeURL:    "https://animeschedule.net/anime/tensei-shitara-slime-datta-ken-4th-season",
			EpisodeText: "Ep 6",
			AirType:     AirTypeDUB,
			LocalTime:   "17:00",
		},
	}

	got := preferredReleaseEntries(entries)

	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2", len(got))
	}
	if got[0].AirType != AirTypeSUB {
		t.Fatalf("first air type = %q, want %q", got[0].AirType, AirTypeSUB)
	}
	if got[1].AirType != AirTypeDUB {
		t.Fatalf("second air type = %q, want %q", got[1].AirType, AirTypeDUB)
	}
}
