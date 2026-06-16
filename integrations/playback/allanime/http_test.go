package allanime

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestGraphqlRequest_SuccessAndHeaders(t *testing.T) {
	t.Parallel()

	var method, url, ct, referer, ua string
	var bodyBuf bytes.Buffer

	provider := &AllAnimeProvider{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				method = req.Method
				url = req.URL.String()
				ct = req.Header.Get("Content-Type")
				referer = req.Header.Get("Referer")
				ua = req.Header.Get("User-Agent")
				_, _ = io.Copy(&bodyBuf, req.Body)
				return mockStringResponse(http.StatusOK, `{"data":{"key":"val"}}`), nil
			}),
		},
	}

	_, err := provider.graphqlRequest(
		context.Background(),
		"query($id:String!){show(_id:$id){name}}",
		map[string]any{"id": "abc"},
	)
	if err != nil {
		t.Fatalf("graphqlRequest() error = %v", err)
	}

	verifyGraphqlRequest(t, method, url, ct, referer, ua, bodyBuf.Bytes())
}

func TestGraphqlRequest_Errors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		status int
		body   string
	}{
		{
			name:   "graphql error in response",
			status: http.StatusOK,
			body:   `{"errors":[{"message":"not found"}]}`,
		},
		{
			name:   "non-200 status",
			status: http.StatusInternalServerError,
			body:   `{"data":{}}`,
		},
		{
			name:   "invalid json body",
			status: http.StatusOK,
			body:   `not json`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			provider := &AllAnimeProvider{
				httpClient: &http.Client{
					Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
						return mockStringResponse(tt.status, tt.body), nil
					}),
				},
			}

			_, err := provider.graphqlRequest(
				context.Background(),
				"query($id:String!){show(_id:$id){name}}",
				map[string]any{"id": "abc"},
			)
			if err == nil {
				t.Error("expected error, got nil")
			}
		})
	}
}

func verifyGraphqlRequest(t *testing.T, method, url, ct, referer, ua string, body []byte) {
	t.Helper()

	if method != http.MethodPost {
		t.Errorf("method = %q, want POST", method)
	}
	if url != allAnimeBaseURL+"/api" {
		t.Errorf("url = %q, want %q", url, allAnimeBaseURL+"/api")
	}
	if ct != "application/json" {
		t.Errorf("Content-Type = %q", ct)
	}
	if referer != allAnimeReferer {
		t.Errorf("Referer = %q", referer)
	}
	if ua != defaultUserAgent {
		t.Errorf("User-Agent = %q", ua)
	}

	var sent map[string]any
	if err := json.Unmarshal(body, &sent); err != nil {
		t.Fatalf("unmarshal sent body: %v", err)
	}
	if sent["query"] != "query($id:String!){show(_id:$id){name}}" {
		t.Errorf("unexpected query in body")
	}
	vars, ok := sent["variables"].(map[string]any)
	if !ok || vars["id"] != "abc" {
		t.Errorf("unexpected variables in body")
	}
}

func TestGraphqlRequest_SetsTranslationTypeLower(t *testing.T) {
	t.Parallel()

	provider := &AllAnimeProvider{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusOK, `{"data":{}}`), nil
			}),
		},
	}

	_, err := provider.graphqlRequest(
		context.Background(),
		"query($t:VaildTranslationTypeEnumType!){x(translationType:$t){id}}",
		map[string]any{"translationType": "SUB"},
	)
	if err != nil {
		t.Fatalf("graphqlRequest: %v", err)
	}
}

func TestGraphqlRequestWithHash_Plain(t *testing.T) {
	t.Parallel()

	provider := &AllAnimeProvider{
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodGet {
					t.Errorf("method = %q, want GET", req.Method)
				}
				if !strings.Contains(req.URL.String(), episodeQueryHash) {
					t.Errorf("url should contain hash, got %q", req.URL.String())
				}
				if req.Header.Get("Referer") != allAnimeReferer {
					t.Errorf("Referer = %q", req.Header.Get("Referer"))
				}
				return mockStringResponse(http.StatusOK, `{"data":{"episode":{"sourceUrls":[{"sourceUrl":"https://example.test/v.mp4","sourceName":"default"}]}}}`), nil
			}),
		},
	}

	result, err := provider.graphqlRequestWithHash(
		context.Background(),
		"show123", "1", "sub",
	)
	if err != nil {
		t.Fatalf("graphqlRequestWithHash: %v", err)
	}

	data, ok := result["data"].(map[string]any)
	if !ok {
		t.Fatal("result missing data key")
	}
	sources := nestedSlice(data, "episode", "sourceUrls")
	if len(sources) != 1 {
		t.Fatalf("got %d sources, want 1", len(sources))
	}
}

func TestGraphqlRequestWithHash_Encrypted(t *testing.T) {
	t.Parallel()

	encryptedPayload := buildEncryptedTobeparsedPayload(t, []byte(`{"sourceUrls":[{"sourceUrl":"https://e.test/v.mp4","sourceName":"default"}]}`))

	provider := &AllAnimeProvider{
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusOK, `{"data":{"tobeparsed":"`+encryptedPayload+`"}}`), nil
			}),
		},
	}

	result, err := provider.graphqlRequestWithHash(
		context.Background(),
		"show456", "2", "dub",
	)
	if err != nil {
		t.Fatalf("graphqlRequestWithHash: %v", err)
	}

	sources := nestedSlice(result, "episode", "sourceUrls")
	if len(sources) != 1 {
		t.Fatalf("got %d sources, want 1", len(sources))
	}
}

func TestGraphqlRequestWithHash_Non200(t *testing.T) {
	t.Parallel()

	provider := &AllAnimeProvider{
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusNotFound, `not found`), nil
			}),
		},
	}

	_, err := provider.graphqlRequestWithHash(
		context.Background(),
		"x", "1", "sub",
	)
	if err == nil {
		t.Fatal("expected error for non-200")
	}
}

func TestGraphqlRequestWithHash_EmptyData(t *testing.T) {
	t.Parallel()

	provider := &AllAnimeProvider{
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusOK, `{"data":{}}`), nil
			}),
		},
	}

	_, err := provider.graphqlRequestWithHash(
		context.Background(),
		"x", "1", "sub",
	)
	if err == nil {
		t.Fatal("expected error for empty data")
	}
}

func TestGetEpisodeSources_EncryptedHash(t *testing.T) {
	t.Parallel()

	encrypted := buildEncryptedTobeparsedPayload(t, []byte(`{"sourceUrls":[{"sourceUrl":"https://direct.test/v.mp4","sourceName":"default"}]}`))

	provider := &AllAnimeProvider{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				t.Error("fallback POST should not be called")
				return nil, nil
			}),
		},
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusOK, `{"data":{"tobeparsed":"`+encrypted+`"}}`), nil
			}),
		},
		extractor: newProviderExtractor(),
	}

	sources, err := provider.GetEpisodeSources(context.Background(), "show1", "1", "sub")
	if err != nil {
		t.Fatalf("GetEpisodeSources: %v", err)
	}
	if len(sources) == 0 {
		t.Fatal("expected at least one source")
	}
	if sources[0].URL != "https://direct.test/v.mp4" {
		t.Errorf("URL = %q", sources[0].URL)
	}
}

func TestGetEpisodeSources_FallbackPost(t *testing.T) {
	t.Parallel()

	sourceResponse := `{"data":{"episode":{"sourceUrls":[{"sourceUrl":"https://direct.test/v.mp4","sourceName":"default"}]}}}`
	fallbackCalled := false

	provider := &AllAnimeProvider{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				fallbackCalled = true
				return mockStringResponse(http.StatusOK, sourceResponse), nil
			}),
		},
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusNotFound, `not found`), nil
			}),
		},
		extractor: newProviderExtractor(),
	}

	sources, err := provider.GetEpisodeSources(context.Background(), "show3", "3", "sub")
	if err != nil {
		t.Fatalf("GetEpisodeSources: %v", err)
	}
	if !fallbackCalled {
		t.Fatal("fallback POST was not called")
	}
	if len(sources) == 0 {
		t.Fatal("expected at least one source")
	}
}

func TestGetEpisodeSources_BothFail(t *testing.T) {
	t.Parallel()

	provider := &AllAnimeProvider{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusNotFound, `not found`), nil
			}),
		},
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusNotFound, `not found`), nil
			}),
		},
		extractor: newProviderExtractor(),
	}

	_, err := provider.GetEpisodeSources(context.Background(), "show4", "4", "sub")
	if err == nil {
		t.Fatal("expected error when both requests fail")
	}
}

func TestGetAvailableEpisodes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		body    string
		wantSub int
		wantDub int
		wantErr bool
	}{
		{
			name:    "sub and dub available",
			body:    `{"data":{"show":{"availableEpisodesDetail":{"sub":["1","2","3"],"dub":["1"]},"lastEpisodeInfo":{}}}}`,
			wantSub: 3,
			wantDub: 1,
		},
		{
			name:    "sub only",
			body:    `{"data":{"show":{"availableEpisodesDetail":{"sub":["1","2"],"dub":null},"lastEpisodeInfo":{}}}}`,
			wantSub: 2,
			wantDub: 0,
		},
		{
			name:    "show not found",
			body:    `{"data":{"show":null}}`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			provider := &AllAnimeProvider{
				httpClient: &http.Client{
					Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
						return mockStringResponse(http.StatusOK, tt.body), nil
					}),
				},
			}

			available, err := provider.GetAvailableEpisodes(context.Background(), "showX")
			if (err != nil) != tt.wantErr {
				t.Fatalf("GetAvailableEpisodes() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}

			if len(available.Sub) != tt.wantSub {
				t.Errorf("Sub count = %d, want %d", len(available.Sub), tt.wantSub)
			}
			if len(available.Dub) != tt.wantDub {
				t.Errorf("Dub count = %d, want %d", len(available.Dub), tt.wantDub)
			}
		})
	}
}

func TestSearch(t *testing.T) {
	t.Parallel()

	t.Run("returns results", func(t *testing.T) {
		t.Parallel()

		provider := &AllAnimeProvider{
			httpClient: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					return mockStringResponse(http.StatusOK, `{"data":{"shows":{"edges":[{"_id":"id1","malId":"1","name":"Title One"},{"_id":"id2","malId":"2","name":"Title Two"}]}}}`), nil
				}),
			},
		}

		results, err := provider.Search(context.Background(), "test", "sub")
		if err != nil {
			t.Fatalf("Search: %v", err)
		}
		if len(results) != 2 {
			t.Fatalf("len = %d, want 2", len(results))
		}
		if results[0].ID != "id1" || results[0].MalID != "1" || results[0].Name != "Title One" {
			t.Errorf("result[0] = %+v", results[0])
		}
	})

	t.Run("empty results", func(t *testing.T) {
		t.Parallel()

		provider := &AllAnimeProvider{
			httpClient: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					return mockStringResponse(http.StatusOK, `{"data":{"shows":{"edges":[]}}}`), nil
				}),
			},
		}

		results, err := provider.Search(context.Background(), "nonexistent", "sub")
		if err != nil {
			t.Fatalf("Search: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("len = %d, want 0", len(results))
		}
	})
}

func TestGetStreams_FullSuccess(t *testing.T) {
	t.Parallel()

	searchBody := `{"data":{"shows":{"edges":[{"_id":"show123","malId":"1","name":"Test Anime"}]}}}`
	encrypted := buildEncryptedTobeparsedPayload(t, []byte(`{"sourceUrls":[{"sourceUrl":"https://stream.test/video.mp4","sourceName":"default"}]}`))

	provider := &AllAnimeProvider{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusOK, searchBody), nil
			}),
		},
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusOK, `{"data":{"tobeparsed":"`+encrypted+`"}}`), nil
			}),
		},
		extractor: newProviderExtractor(),
	}

	result, err := provider.GetStreams(context.Background(), 1, []string{"Test Anime"}, "1", "sub")
	if err != nil {
		t.Fatalf("GetStreams: %v", err)
	}
	if result.URL != "https://stream.test/video.mp4" {
		t.Errorf("URL = %q", result.URL)
	}
	if result.Referer != allAnimeReferer {
		t.Errorf("Referer = %q", result.Referer)
	}
	if result.Type != "mp4" {
		t.Errorf("Type = %q", result.Type)
	}
}

func TestGetStreams_ShowNotFound(t *testing.T) {
	t.Parallel()

	provider := &AllAnimeProvider{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusOK, `{"data":{"shows":{"edges":[]}}}`), nil
			}),
		},
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				t.Error("should not call episode sources when show not found")
				return nil, nil
			}),
		},
		extractor: newProviderExtractor(),
	}

	_, err := provider.GetStreams(context.Background(), 999, []string{"Nothing"}, "1", "sub")
	if err == nil {
		t.Fatal("expected error for show not found")
	}
}

func TestGetStreams_NoSources(t *testing.T) {
	t.Parallel()

	provider := &AllAnimeProvider{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusOK, `{"data":{"shows":{"edges":[{"_id":"showX","malId":"1","name":"Anime"}]}}}`), nil
			}),
		},
		utlsClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return mockStringResponse(http.StatusNotFound, `not found`), nil
			}),
		},
		extractor: newProviderExtractor(),
	}

	_, err := provider.GetStreams(context.Background(), 1, []string{"Anime"}, "1", "sub")
	if err == nil {
		t.Fatal("expected error when no sources")
	}
}

func TestParseProviderResponse(t *testing.T) {
	t.Parallel()

	t.Run("extracts links and subtitles", func(t *testing.T) {
		t.Parallel()

		body := `{"links":[{"link":"https://cdn.test/video.mp4","resolutionStr":"1080p"}],"subtitles":[{"lang":"en","src":"https://sub.test/en.vtt"}]}`
		extractor := &providerExtractor{
			baseURL: allAnimeSiteURL,
			referer: allAnimeReferer,
		}

		sources := extractor.parseProviderResponse(context.Background(), body)
		if len(sources) == 0 {
			t.Fatal("expected at least one source")
		}

		if sources[0].URL != "https://cdn.test/video.mp4" {
			t.Errorf("URL = %q", sources[0].URL)
		}
		if sources[0].Quality != "1080p" {
			t.Errorf("Quality = %q", sources[0].Quality)
		}
		if len(sources[0].Subtitles) != 1 {
			t.Fatalf("subtitles count = %d, want 1", len(sources[0].Subtitles))
		}
		if sources[0].Subtitles[0].Lang != "en" {
			t.Errorf("sub lang = %q", sources[0].Subtitles[0].Lang)
		}
	})

	t.Run("invalid json returns empty", func(t *testing.T) {
		t.Parallel()

		extractor := &providerExtractor{
			baseURL: allAnimeSiteURL,
			referer: allAnimeReferer,
		}

		sources := extractor.parseProviderResponse(context.Background(), "not json")
		if len(sources) != 0 {
			t.Errorf("expected empty, got %d sources", len(sources))
		}
	})

	t.Run("empty response returns empty", func(t *testing.T) {
		t.Parallel()

		extractor := &providerExtractor{
			baseURL: allAnimeSiteURL,
			referer: allAnimeReferer,
		}

		sources := extractor.parseProviderResponse(context.Background(), "{}")
		if len(sources) != 0 {
			t.Errorf("expected empty, got %d sources", len(sources))
		}
	})
}

func TestParseExternalEmbedResponse(t *testing.T) {
	t.Parallel()

	t.Run("ok.ru extracts hls manifest", func(t *testing.T) {
		t.Parallel()

		body := `{"flashvars":{"metadata":"{\"hlsManifestUrl\":\"https://ok.example.test/playlist.m3u8\"}"}}`
		sources := parseExternalEmbedResponse("https://ok.ru/video/123", body, allAnimeReferer)
		if len(sources) != 1 {
			t.Fatalf("got %d sources, want 1", len(sources))
		}
		if sources[0].URL != "https://ok.example.test/playlist.m3u8" {
			t.Errorf("URL = %q", sources[0].URL)
		}
		if sources[0].Provider != "ok" {
			t.Errorf("Provider = %q", sources[0].Provider)
		}
	})

	t.Run("mp4upload extracts src", func(t *testing.T) {
		t.Parallel()

		body := `src: "https://mp4upload.example.test/video.mp4"`
		sources := parseExternalEmbedResponse("https://mp4upload.com/e/abc", body, allAnimeReferer)
		if len(sources) != 1 {
			t.Fatalf("got %d sources, want 1", len(sources))
		}
		if sources[0].URL != "https://mp4upload.example.test/video.mp4" {
			t.Errorf("URL = %q", sources[0].URL)
		}
		if sources[0].Provider != "mp4upload" {
			t.Errorf("Provider = %q", sources[0].Provider)
		}
	})

	t.Run("unknown embed returns empty", func(t *testing.T) {
		t.Parallel()

		sources := parseExternalEmbedResponse("https://unknown.example.com/video", "<html></html>", allAnimeReferer)
		if len(sources) != 0 {
			t.Errorf("expected empty, got %d sources", len(sources))
		}
	})
}

func TestParseM3U8Sources(t *testing.T) {
	t.Parallel()

	t.Run("parses bandwidth entries", func(t *testing.T) {
		t.Parallel()

		body := "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080\n1080p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000\n720p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2500000\n480p.m3u8"
		masterURL := "https://cdn.test/master.m3u8"

		sources := parseM3U8Sources(body, masterURL, allAnimeReferer)
		if len(sources) != 3 {
			t.Fatalf("got %d sources, want 3", len(sources))
		}

		expected := []struct {
			url     string
			quality string
		}{
			{"https://cdn.test/1080p.m3u8", "1080p"},
			{"https://cdn.test/720p.m3u8", "720p"},
			{"https://cdn.test/480p.m3u8", "480p"},
		}
		for i, exp := range expected {
			if sources[i].URL != exp.url {
				t.Errorf("sources[%d].URL = %q, want %q", i, sources[i].URL, exp.url)
			}
			if sources[i].Quality != exp.quality {
				t.Errorf("sources[%d].Quality = %q, want %q", i, sources[i].Quality, exp.quality)
			}
			if sources[i].Type != "m3u8" {
				t.Errorf("sources[%d].Type = %q", i, sources[i].Type)
			}
		}
	})

	t.Run("empty body returns nothing", func(t *testing.T) {
		t.Parallel()

		sources := parseM3U8Sources("", "https://cdn.test/master.m3u8", allAnimeReferer)
		if len(sources) != 0 {
			t.Errorf("expected empty, got %d", len(sources))
		}
	})

	t.Run("absolute URLs not rebased", func(t *testing.T) {
		t.Parallel()

		body := "#EXT-X-STREAM-INF:BANDWIDTH=8000000\nhttps://cdn2.test/video.m3u8"
		sources := parseM3U8Sources(body, "https://cdn.test/master.m3u8", allAnimeReferer)
		if len(sources) != 1 {
			t.Fatalf("got %d sources", len(sources))
		}
		if sources[0].URL != "https://cdn2.test/video.m3u8" {
			t.Errorf("URL = %q", sources[0].URL)
		}
	})
}

func TestExtractVideoLinks(t *testing.T) {
	t.Parallel()

	t.Run("fetches and parses provider response", func(t *testing.T) {
		t.Parallel()

		extractor := &providerExtractor{
			httpClient: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					if req.Method != http.MethodGet {
						t.Errorf("method = %q, want GET", req.Method)
					}
					if req.Header.Get("Referer") != allAnimeReferer {
						t.Errorf("Referer = %q", req.Header.Get("Referer"))
					}
					body := `{"links":[{"link":"https://cdn.test/video.mp4","resolutionStr":"720p"}]}`
					return mockStringResponse(http.StatusOK, body), nil
				}),
			},
			baseURL: allAnimeSiteURL,
			referer: allAnimeReferer,
		}

		sources, err := extractor.ExtractVideoLinks(context.Background(), "/some-path")
		if err != nil {
			t.Fatalf("ExtractVideoLinks: %v", err)
		}
		if len(sources) != 1 {
			t.Fatalf("got %d sources, want 1", len(sources))
		}
		if sources[0].Provider != "wixmp" {
			t.Errorf("Provider = %q", sources[0].Provider)
		}
	})

	t.Run("server error returns empty sources", func(t *testing.T) {
		t.Parallel()

		extractor := &providerExtractor{
			httpClient: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					return mockStringResponse(http.StatusInternalServerError, ""), nil
				}),
			},
			baseURL: allAnimeSiteURL,
			referer: allAnimeReferer,
		}

		sources, err := extractor.ExtractVideoLinks(context.Background(), "/error-path")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if len(sources) != 0 {
			t.Errorf("expected empty sources, got %d", len(sources))
		}
	})
}

func TestExtractEmbedVideoLinks(t *testing.T) {
	t.Parallel()

	t.Run("ok.ru embed extracted", func(t *testing.T) {
		t.Parallel()

		extractor := &providerExtractor{
			httpClient: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					body := `{"flashvars":{"metadata":"{\"hlsManifestUrl\":\"https://ok.test/play.m3u8\"}"}}`
					return mockStringResponse(http.StatusOK, body), nil
				}),
			},
			referer: allAnimeReferer,
		}

		sources, err := extractor.ExtractEmbedVideoLinks(context.Background(), "https://ok.ru/video/123")
		if err != nil {
			t.Fatalf("ExtractEmbedVideoLinks: %v", err)
		}
		if len(sources) != 1 {
			t.Fatalf("got %d sources, want 1", len(sources))
		}
		if sources[0].URL != "https://ok.test/play.m3u8" {
			t.Errorf("URL = %q", sources[0].URL)
		}
	})

	t.Run("unknown embed returns empty", func(t *testing.T) {
		t.Parallel()

		extractor := &providerExtractor{
			httpClient: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					return mockStringResponse(http.StatusOK, "<html></html>"), nil
				}),
			},
			referer: allAnimeReferer,
		}

		sources, err := extractor.ExtractEmbedVideoLinks(context.Background(), "https://unknown.com/video")
		if err != nil {
			t.Fatalf("ExtractEmbedVideoLinks: %v", err)
		}
		if len(sources) != 0 {
			t.Errorf("expected empty, got %d sources", len(sources))
		}
	})
}
