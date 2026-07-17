package tmdb

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetMediaLoadsDetailsAndArtwork(t *testing.T) {
	t.Parallel()
	requests := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/136840", func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("unexpected authorization header %q", r.Header.Get("Authorization"))
		}
		writeJSON(t, w, `{"id":136840,"name":"The Apothecary Diaries","original_name":"薬屋のひとりごと","overview":"Mysteries at the palace.","backdrop_path":"/hero.jpg","poster_path":"/poster.jpg","seasons":[{"id":1,"name":"Specials","season_number":0},{"id":2,"name":"Season 1","season_number":1,"episode_count":24}]}`)
	})
	mux.HandleFunc("/tv/136840/images", func(w http.ResponseWriter, r *http.Request) {
		requests++
		if got := r.URL.Query().Get("include_image_language"); got != "en,ja,null" {
			t.Fatalf("unexpected image languages %q", got)
		}
		writeJSON(t, w, `{"id":136840,"backdrops":[{"file_path":"/backdrop.jpg","width":1920,"height":1080}],"logos":[{"file_path":"/logo.png","iso_639_1":"en"}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	media, err := client.GetMedia(context.Background(), MediaRef{Type: MediaTypeTV, ID: 136840}, ImageOptions{IncludeImageLanguages: []string{"en", "ja", "null"}})
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || media.Name != "The Apothecary Diaries" || len(media.Seasons) != 2 || len(media.Backdrops) != 1 || len(media.Logos) != 1 {
		t.Fatalf("unexpected media response: requests=%d media=%+v", requests, media)
	}
}

func TestEpisodeGroupMethods(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/136840/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":136840,"results":[{"id":"seasons","name":"Seasons","episode_count":48,"group_count":3,"type":1}]}`)
	})
	mux.HandleFunc("/tv/episode_group/seasons", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":"seasons","name":"Seasons","group_count":2,"groups":[{"id":"specials","name":"Specials","order":0,"episodes":[]},{"id":"season-1","name":"Season 1","order":1,"episodes":[{"id":10,"name":"Maomao","overview":"An apothecary arrives.","still_path":"/episode.jpg","episode_number":1,"season_number":1,"order":0}]}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	groups, err := client.GetEpisodeGroups(context.Background(), 136840)
	if err != nil || len(groups.Results) != 1 || groups.Results[0].Name != "Seasons" {
		t.Fatalf("unexpected episode groups: groups=%+v err=%v", groups, err)
	}
	group, err := client.GetEpisodeGroup(context.Background(), groups.Results[0].ID)
	if err != nil || len(group.Groups) != 2 || len(group.Groups[1].Episodes) != 1 {
		t.Fatalf("unexpected episode group: group=%+v err=%v", group, err)
	}
}

func TestSearch(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/search/tv", func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("query"); got != "Apothecary Diaries" {
			t.Fatalf("unexpected query %q", got)
		}
		if got := r.URL.Query().Get("first_air_date_year"); got != "2023" {
			t.Fatalf("unexpected first air date year %q", got)
		}
		writeJSON(t, w, `{"results":[{"id":136840,"name":"The Apothecary Diaries","backdrop_path":"/hero.jpg"}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	results, err := client.Search(context.Background(), MediaTypeTV, "Apothecary Diaries", 2023)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].ID != 136840 || results[0].Type != MediaTypeTV || results[0].BackdropPath != "/hero.jpg" {
		t.Fatalf("unexpected search results: %+v", results)
	}
}

func TestGetSeason(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/136840/season/1", func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("language"); got != "en-US" {
			t.Fatalf("unexpected language %q", got)
		}
		writeJSON(t, w, `{"id":2,"name":"Season 1","season_number":1,"overview":"The first season.","episodes":[{"id":10,"name":"Maomao","overview":"An apothecary arrives.","still_path":"/episode.jpg","episode_number":1,"season_number":1}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	season, err := client.GetSeason(context.Background(), 136840, 1, "en-US")
	if err != nil || len(season.Episodes) != 1 || season.Episodes[0].StillPath != "/episode.jpg" {
		t.Fatalf("unexpected season: season=%+v err=%v", season, err)
	}
}

func TestGetSeasonMetadataFallsBackToEpisodeGroupSeason(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/278043/season/2", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		writeJSON(t, w, `{"success":false,"status_code":34,"status_message":"The resource you requested could not be found."}`)
	})
	mux.HandleFunc("/tv/278043/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":278043,"results":[{"id":"seasons","name":"Seasons","episode_count":16,"group_count":2,"type":1}]}`)
	})
	mux.HandleFunc("/tv/episode_group/seasons", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":"seasons","name":"Seasons","group_count":2,"groups":[{"id":"season-1","name":"Season 1","order":1,"episodes":[{"id":1,"name":"You, My Polar Opposite","episode_number":1,"season_number":1,"order":0}]},{"id":"season-2","name":"Season 2","order":2,"episodes":[{"id":13,"name":"Christmas Eve","episode_number":13,"season_number":1,"order":0},{"id":14,"name":"Dilemma of a Winter's Night","episode_number":14,"season_number":1,"order":1}]}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	season, err := client.GetSeasonMetadata(context.Background(), 278043, 2, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if season.Name != "Season 2" || season.SeasonNumber != 2 || len(season.Episodes) != 2 {
		t.Fatalf("unexpected fallback season: %+v", season)
	}
	if season.Episodes[0].Name != "Christmas Eve" || season.Episodes[0].EpisodeNumber != 1 || season.Episodes[0].SeasonNumber != 2 {
		t.Fatalf("fallback episode was not normalized: %+v", season.Episodes[0])
	}
}

func TestGetSeasonMetadataForReleaseFindsBungoSeasonFiveDespiteWrongMapping(t *testing.T) { //nolint:cyclop,funlen // One end-to-end HTTP fixture.
	t.Parallel()
	mux := http.NewServeMux()
	requests := 0
	mux.HandleFunc("/tv/65931/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		requests++
		writeJSON(t, w, `{"id":65931,"results":[{"id":"seasons","name":"Seasons","episode_count":61,"group_count":5,"type":7}]}`)
	})
	mux.HandleFunc("/tv/episode_group/seasons", func(w http.ResponseWriter, _ *http.Request) {
		requests++
		writeJSON(t, w, `{"id":"seasons","name":"Seasons","type":7,"groups":[
			{"id":"s1","name":"Season 1","order":1,"episodes":[{"episode_number":1,"season_number":1,"name":"Episode 1","air_date":"2016-04-07"}]},
			{"id":"s3","name":"Season 3","order":3,"episodes":[
				{"episode_number":14,"season_number":1,"name":"Wrong release","air_date":"2019-04-12"},
				{"episode_number":15,"season_number":1,"name":"Wrong release 2"},
				{"episode_number":16,"season_number":1,"name":"Wrong release 3"},
				{"episode_number":17,"season_number":1,"name":"Wrong release 4"},
				{"episode_number":18,"season_number":1,"name":"Wrong release 5"},
				{"episode_number":19,"season_number":1,"name":"Wrong release 6"},
				{"episode_number":20,"season_number":1,"name":"Wrong release 7"},
				{"episode_number":21,"season_number":1,"name":"Wrong release 8"},
				{"episode_number":22,"season_number":1,"name":"Wrong release 9"},
				{"episode_number":23,"season_number":1,"name":"Wrong release 10"},
				{"episode_number":24,"season_number":1,"name":"Wrong release 11"}
			]},
			{"id":"s5","name":"Season 5","order":5,"episodes":[
				{"episode_number":50,"season_number":1,"name":"The Strongest Man","air_date":"2023-07-12","still_path":"/ep-50.jpg"},
				{"episode_number":51,"season_number":1,"name":"The Answer to Everything"},
				{"episode_number":52,"season_number":1,"name":"HERO VS. CRIMINAL"},
				{"episode_number":53,"season_number":1,"name":"HERO WAR, GANG WAR"},
				{"episode_number":54,"season_number":1,"name":"At the Port in the Sky (Part 1)"},
				{"episode_number":55,"season_number":1,"name":"At the Port in the Sky (Part 2)"},
				{"episode_number":56,"season_number":1,"name":"At the Port in the Sky (Part 3)"},
				{"episode_number":57,"season_number":1,"name":"Land of Inhuman Demons (Part 1)"},
				{"episode_number":58,"season_number":1,"name":"Land of Inhuman Demons (Part 2)"},
				{"episode_number":59,"season_number":1,"name":"Inhuman Demons (Part 3)"},
				{"episode_number":60,"season_number":1,"name":"Twilight Goodbye","still_path":"/ep-60.jpg"}
			]}
		]}`)
	})
	mux.HandleFunc("/tv/65931/season/3", func(_ http.ResponseWriter, _ *http.Request) {
		t.Fatal("ordinary season endpoint should not be needed for a release match")
	})
	client, server := testClient(t, mux)
	defer server.Close()

	match := SeasonMetadataMatch{
		SeasonNumber: 3,
		EpisodeMin:   14,
		EpisodeMax:   24,
		EpisodeCount: 11,
		FirstAirDate: "2023-07-12T00:00:00+00:00",
		EpisodeTitles: []string{
			"The Strongest Man", "The Answer to Everything", "HERO VS. CRIMINAL",
		},
	}
	season, err := client.GetSeasonMetadataForRelease(context.Background(), 65931, match, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || season.SeasonNumber != 5 || len(season.Episodes) != 11 {
		t.Fatalf("requests=%d season=%+v", requests, season)
	}
	if season.Episodes[0].EpisodeNumber != 50 || season.Episodes[0].StillPath != "/ep-50.jpg" || season.Episodes[10].EpisodeNumber != 60 || season.Episodes[10].StillPath != "/ep-60.jpg" {
		t.Fatalf("unexpected Bungo season metadata: %+v", season.Episodes)
	}

	if _, err := client.GetSeasonMetadataForRelease(context.Background(), 65931, match, "en-US"); err != nil {
		t.Fatal(err)
	}
	if requests != 2 {
		t.Fatalf("episode group requests = %d, want cached result", requests)
	}
}

func TestGetSeasonMetadataForReleaseFallsBackWhenEpisodeGroupsAreAmbiguous(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/42/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"results":[{"id":"seasons","name":"Seasons","type":7}]}`)
	})
	mux.HandleFunc("/tv/episode_group/seasons", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"groups":[
			{"name":"A","order":1,"episodes":[{"id":1,"episode_number":10,"season_number":1,"name":"Alpha"},{"id":2,"episode_number":11,"season_number":1,"name":"Beta"}]},
			{"name":"B","order":2,"episodes":[{"id":3,"episode_number":10,"season_number":1,"name":"Alpha"},{"id":4,"episode_number":11,"season_number":1,"name":"Beta"}]}
		]}`)
	})
	mux.HandleFunc("/tv/42/season/9", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"name":"Canonical fallback","season_number":9,"episodes":[{"episode_number":1,"season_number":9,"name":"Fallback"}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	season, err := client.GetSeasonMetadataForRelease(context.Background(), 42, SeasonMetadataMatch{
		SeasonNumber: 9,
		EpisodeMin:   10,
		EpisodeMax:   11,
		EpisodeCount: 2,
	}, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if season.Name != "Canonical fallback" {
		t.Fatalf("ambiguous group match should fall back, got %+v", season)
	}
}

func TestGetSeasonMetadataForReleaseChecksEveryEpisodeGroup(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/77/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"results":[{"id":"seasons","name":"Seasons","type":7},{"id":"alternate","name":"Broadcast order","type":1}]}`)
	})
	mux.HandleFunc("/tv/episode_group/seasons", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"groups":[{"name":"Wrong","order":4,"episodes":[{"episode_number":1,"season_number":1,"name":"Other","air_date":"2020-01-01"}]}]}`)
	})
	mux.HandleFunc("/tv/episode_group/alternate", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"groups":[{"name":"Release","order":9,"episodes":[{"episode_number":301,"season_number":1,"name":"Distinct title","air_date":"2024-02-03","overview":"Full metadata","still_path":"/301.jpg"}]}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	season, err := client.GetSeasonMetadataForRelease(context.Background(), 77, SeasonMetadataMatch{
		SeasonNumber:  4,
		EpisodeMin:    1,
		EpisodeMax:    1,
		EpisodeCount:  1,
		FirstAirDate:  "2024-02-03",
		EpisodeTitles: []string{"Distinct title"},
	}, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if season.SeasonNumber != 9 || len(season.Episodes) != 1 || season.Episodes[0].StillPath != "/301.jpg" || season.Episodes[0].Overview != "Full metadata" {
		t.Fatalf("did not select complete metadata from alternate group: %+v", season)
	}
}

func TestGetSeasonMetadataForReleaseFindsFrierenSeasonTwoFromSeasonZeroHint(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/209867/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"results":[{"id":"seasons","name":"Seasons","type":7}]}`)
	})
	mux.HandleFunc("/tv/episode_group/seasons", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"groups":[
			{"name":"Specials","order":0,"episodes":[{"episode_number":1,"season_number":0,"name":"Special","air_date":"2023-10-11"}]},
			{"name":"Season 2","order":2,"episodes":[
				{"episode_number":29,"season_number":1,"name":"Episode 29","air_date":"2026-01-16","overview":"First overview","still_path":"/29.jpg"},
				{"episode_number":30,"season_number":1,"name":"Episode 30"},
				{"episode_number":31,"season_number":1,"name":"Episode 31"},
				{"episode_number":32,"season_number":1,"name":"Episode 32"},
				{"episode_number":33,"season_number":1,"name":"Episode 33"},
				{"episode_number":34,"season_number":1,"name":"Episode 34"},
				{"episode_number":35,"season_number":1,"name":"Episode 35"},
				{"episode_number":36,"season_number":1,"name":"Episode 36"},
				{"episode_number":37,"season_number":1,"name":"Episode 37"},
				{"episode_number":38,"season_number":1,"name":"Episode 38","overview":"Last overview","still_path":"/38.jpg"}
			]}
		]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	season, err := client.GetSeasonMetadataForRelease(context.Background(), 209867, SeasonMetadataMatch{
		SeasonNumber: 0,
		EpisodeMin:   1,
		EpisodeMax:   10,
		EpisodeCount: 10,
		FirstAirDate: "2026-01-16",
	}, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if season.SeasonNumber != 2 || len(season.Episodes) != 10 || season.Episodes[0].EpisodeNumber != 29 || season.Episodes[9].EpisodeNumber != 38 {
		t.Fatalf("unexpected Frieren season: %+v", season)
	}
	if season.Episodes[0].StillPath != "/29.jpg" || season.Episodes[0].Overview != "First overview" || season.Episodes[9].StillPath != "/38.jpg" || season.Episodes[9].Overview != "Last overview" {
		t.Fatalf("Frieren episode metadata was not preserved: %+v", season.Episodes)
	}
}

func TestSeasonFromEpisodeGroupBlockKeepsLargeInventories(t *testing.T) {
	t.Parallel()
	episodes := make([]Episode, 1500)
	for index := range episodes {
		episodes[index] = Episode{
			ID:            int64(index + 1),
			EpisodeNumber: index + 1,
			SeasonNumber:  1,
			Name:          fmt.Sprintf("Episode %d", index+1),
			Overview:      "Metadata",
			StillPath:     fmt.Sprintf("/%d.jpg", index+1),
		}
	}
	season := seasonFromEpisodeGroupBlock(EpisodeBlock{Order: 25, Episodes: episodes})
	if len(season.Episodes) != 1500 || season.Episodes[1499].EpisodeNumber != 1500 || season.Episodes[1499].StillPath != "/1500.jpg" {
		t.Fatalf("large episode inventory was truncated: count=%d last=%+v", len(season.Episodes), season.Episodes[len(season.Episodes)-1])
	}
}

func TestGetSeasonMetadataPrefersRegularSeasonWhenAvailable(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/207468/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":207468,"results":[{"id":"seasons","name":"Seasons","episode_count":24,"group_count":3,"type":6}]}`)
	})
	mux.HandleFunc("/tv/episode_group/seasons", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":"seasons","name":"Seasons","group_count":3,"groups":[{"id":"season-1","name":"Season 1","order":1,"episodes":[{"id":1,"name":"The Man Who Became a Kaiju","episode_number":1,"season_number":1}]},{"id":"season-2","name":"Season 2","order":2,"episodes":[{"id":13,"name":"Kaiju Weapon","episode_number":13,"season_number":1},{"id":14,"name":"The Next Generation's Trial","episode_number":14,"season_number":1}]}]}`)
	})
	mux.HandleFunc("/tv/207468/season/2", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":2,"name":"Season 2","season_number":2,"episodes":[{"id":1,"name":"Regular season metadata","overview":"Richer metadata from the canonical season endpoint.","still_path":"/regular.jpg","episode_number":1,"season_number":2}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	season, err := client.GetSeasonMetadata(context.Background(), 207468, 2, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if len(season.Episodes) != 1 || season.Episodes[0].Name != "Regular season metadata" {
		t.Fatalf("expected regular season metadata, got %+v", season)
	}
	if season.Episodes[0].StillPath != "/regular.jpg" || season.Episodes[0].Overview == "" {
		t.Fatalf("regular season details were not preserved: %+v", season.Episodes[0])
	}
}

func TestGetSeasonMetadataPreservesEpisodeNumbersForMatchingSeason(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/46260/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":46260,"results":[{"id":"seasons","name":"Seasons","episode_count":220,"group_count":4,"type":1}]}`)
	})
	mux.HandleFunc("/tv/episode_group/seasons", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":"seasons","name":"Seasons","group_count":4,"groups":[{"id":"season-2","name":"Season 2","order":2,"episodes":[{"id":53,"name":"Long Time No See: Jiraiya Returns!","episode_number":53,"season_number":2,"still_path":"/episode-53.jpg","runtime":24}]}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	season, err := client.GetSeasonMetadata(context.Background(), 46260, 2, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if len(season.Episodes) != 1 {
		t.Fatalf("expected one episode, got %+v", season)
	}
	episode := season.Episodes[0]
	if episode.EpisodeNumber != 53 || episode.SeasonNumber != 2 || episode.StillPath != "/episode-53.jpg" || episode.Runtime != 24 {
		t.Fatalf("matching-season episode metadata was renumbered: %+v", episode)
	}
}

func TestGetSeasonMetadataPrefersNoSpecialsBeforeTVDBArcGroups(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/tv/30984/episode_groups", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":30984,"results":[{"id":"tvdb","name":"TVDB Order","episode_count":410,"group_count":18,"type":1},{"id":"no-specials","name":"No Specials","episode_count":406,"group_count":2,"type":1}]}`)
	})
	mux.HandleFunc("/tv/episode_group/tvdb", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":"tvdb","name":"TVDB Order","groups":[{"id":"arc-1","name":"Substitute Shinigami","order":1,"episodes":[{"id":1,"name":"The Day I Became a Shinigami","episode_number":1,"season_number":1}]}]}`)
	})
	mux.HandleFunc("/tv/episode_group/no-specials", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, `{"id":"no-specials","name":"No Specials","groups":[{"id":"bleach","name":"Bleach","order":1,"episodes":[{"id":1,"name":"The Day I Became a Shinigami","episode_number":1,"season_number":1},{"id":21,"name":"Enter! The World of the Shinigami","episode_number":21,"season_number":1}]}]}`)
	})
	client, server := testClient(t, mux)
	defer server.Close()

	season, err := client.GetSeasonMetadata(context.Background(), 30984, 1, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if len(season.Episodes) != 2 || season.Episodes[1].Name != "Enter! The World of the Shinigami" {
		t.Fatalf("expected no-specials group, got %+v", season)
	}
}

func TestAPIErrorAndMissingToken(t *testing.T) {
	t.Parallel()
	client, server := testClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		writeJSON(t, w, `{"success":false,"status_code":34,"status_message":"The resource you requested could not be found."}`)
	}))
	defer server.Close()

	_, err := client.GetEpisodeGroups(context.Background(), 999)
	var apiError *APIError
	if !errors.As(err, &apiError) || apiError.StatusCode != http.StatusNotFound || apiError.Code != 34 || apiError.StatusMessage == "" {
		t.Fatalf("expected TMDB API error, got %v", err)
	}
	_, err = NewClient(Config{}).GetEpisodeGroups(context.Background(), 999)
	if err == nil {
		t.Fatal("expected missing token error")
	}
}

func TestImageURL(t *testing.T) {
	t.Parallel()
	if got := ImageURL("/still.jpg", "w780"); got != "https://image.tmdb.org/t/p/w780/still.jpg" {
		t.Fatalf("unexpected image URL %q", got)
	}
	if got := ImageURL("", "original"); got != "" {
		t.Fatalf("expected empty URL, got %q", got)
	}
}

func testClient(t *testing.T, handler http.Handler) (*Client, *httptest.Server) {
	t.Helper()
	server := httptest.NewServer(handler)
	client := NewClient(Config{AccessToken: "test-token"})
	client.baseURL = server.URL
	return client, server
}

func writeJSON(t *testing.T, w http.ResponseWriter, body string) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(body)); err != nil {
		t.Fatal(err)
	}
}
