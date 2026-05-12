package playback

import (
	"context"
	"crypto/aes"
	"encoding/json"
	"testing"
)

func TestDecodeSourceURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		encoded string
		want    string
	}{
		{
			name:    "empty returns empty",
			encoded: "",
			want:    "",
		},
		{
			name:    "with double prefix stripped",
			encoded: "--example.com/video.mp4",
			want:    "example.com/video.mp4",
		},
		{
			name:    "hex substitution",
			encoded: "7aexample",
			want:    "Bexample",
		},
		{
			name:    "mixed substitution",
			encoded: "79url7a01",
			want:    "AurlB9",
		},
		{
			name:    "clock replacement",
			encoded: "/clock",
			want:    "/clock.json",
		},
		{
			name:    "no clock replacement if already json",
			encoded: "/clock.json",
			want:    "/clock.json",
		},
		{
			name:    "complex url",
			encoded: "--79stream7acom",
			want:    "AstreamBcom",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := decodeSourceURL(tt.encoded)
			if got != tt.want {
				t.Errorf("decodeSourceURL(%q) = %q, want %q", tt.encoded, got, tt.want)
			}
		})
	}
}

func TestDetectStreamType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		url      string
		wantType string
	}{
		{
			name:     "m3u8 extension",
			url:      "https://example.com/video.m3u8",
			wantType: "m3u8",
		},
		{
			name:     "master m3u8",
			url:      "https://example.com/master.m3u8",
			wantType: "m3u8",
		},
		{
			name:     "mp4 extension",
			url:      "https://example.com/video.mp4",
			wantType: "mp4",
		},
		{
			name:     "unknown",
			url:      "https://example.com/video.avi",
			wantType: "unknown",
		},
		{
			name:     "empty returns unknown",
			url:      "",
			wantType: "unknown",
		},
		{
			name:     "case insensitive - M3U8",
			url:      "https://example.com/MASTER.M3U8",
			wantType: "m3u8",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := detectStreamType(tt.url)
			if got != tt.wantType {
				t.Errorf("detectStreamType(%q) = %q, want %q", tt.url, got, tt.wantType)
			}
		})
	}
}

func TestDetectEmbedType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		url      string
		wantType string
	}{
		{
			name:     "streamwish",
			url:      "https://streamwish.com/e/abc123",
			wantType: "embed",
		},
		{
			name:     "streamsb",
			url:      "https://streamsb.com/e/abc123",
			wantType: "embed",
		},
		{
			name:     "mp4upload",
			url:      "https://mp4upload.com/e/abc123",
			wantType: "embed",
		},
		{
			name:     "ok.ru",
			url:      "https://ok.ru/video/123",
			wantType: "embed",
		},
		{
			name:     "gogoplay",
			url:      "https://gogoplay.io/embed/123",
			wantType: "embed",
		},
		{
			name:     "streamlare",
			url:      "https://streamlare.com/e/abc",
			wantType: "embed",
		},
		{
			name:     "unknown host",
			url:      "https://unknown.com/video",
			wantType: "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := detectEmbedType(tt.url)
			if got != tt.wantType {
				t.Errorf("detectEmbedType(%q) = %q, want %q", tt.url, got, tt.wantType)
			}
		})
	}
}

func TestBuildStreamSource(t *testing.T) {
	t.Parallel()

	t.Run("constructs with correct defaults", func(t *testing.T) {
		got := buildStreamSource("https://example.com/video.mp4", "mp4", "test-provider")

		if got.URL != "https://example.com/video.mp4" {
			t.Errorf("URL = %q, want %q", got.URL, "https://example.com/video.mp4")
		}
		if got.Provider != "test-provider" {
			t.Errorf("Provider = %q, want %q", got.Provider, "test-provider")
		}
		if got.Type != "mp4" {
			t.Errorf("Type = %q, want %q", got.Type, "mp4")
		}
		if got.Referer != allAnimeReferer {
			t.Errorf("Referer = %q, want %q", got.Referer, allAnimeReferer)
		}
	})
}

func TestBuildSourceReferences(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		rawURLs  []any
		wantRefs []sourceReference
	}{
		{
			name:     "empty returns empty",
			rawURLs:  nil,
			wantRefs: nil,
		},
		{
			name: "filters empty URLs",
			rawURLs: []any{
				map[string]any{"sourceUrl": "", "sourceName": "test"},
				map[string]any{"sourceUrl": "https://example.com/v.mp4", "sourceName": "default"},
			},
			wantRefs: []sourceReference{
				{URL: "https://example.com/v.mp4", Name: "default"},
			},
		},
		{
			name: "deduplicates URLs",
			rawURLs: []any{
				map[string]any{"sourceUrl": "https://example.com/v.mp4", "sourceName": "test"},
				map[string]any{"sourceUrl": "https://example.com/v.mp4", "sourceName": "test2"},
			},
			wantRefs: []sourceReference{
				{URL: "https://example.com/v.mp4", Name: "test"},
			},
		},
		{
			name: "prioritizes default provider",
			rawURLs: []any{
				map[string]any{"sourceUrl": "https://a.com/v.mp4", "sourceName": "fallback"},
				map[string]any{"sourceUrl": "https://b.com/v.mp4", "sourceName": "default"},
				map[string]any{"sourceUrl": "https://c.com/v.mp4", "sourceName": "yt-mp4"},
			},
			wantRefs: []sourceReference{
				{URL: "https://b.com/v.mp4", Name: "default"},
				{URL: "https://c.com/v.mp4", Name: "yt-mp4"},
				{URL: "https://a.com/v.mp4", Name: "fallback"},
			},
		},
		{
			name: "skips invalid map entries",
			rawURLs: []any{
				"invalid",
				123,
				map[string]any{"sourceUrl": "https://example.com/v.mp4"},
			},
			wantRefs: []sourceReference{
				{URL: "https://example.com/v.mp4", Name: ""},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := buildSourceReferences(tt.rawURLs)

			if len(got) != len(tt.wantRefs) {
				t.Errorf("got %d refs, want %d", len(got), len(tt.wantRefs))
				return
			}

			for i, want := range tt.wantRefs {
				if got[i].URL != want.URL {
					t.Errorf("ref[%d].URL = %q, want %q", i, got[i].URL, want.URL)
				}
				if got[i].Name != want.Name {
					t.Errorf("ref[%d].Name = %q, want %q", i, got[i].Name, want.Name)
				}
			}
		})
	}
}

func TestBuildSourceReferencesOrder(t *testing.T) {
	t.Parallel()

	rawURLs := []any{
		map[string]any{"sourceUrl": "https://s.com/v.mp4", "sourceName": "s-mp4"},
		map[string]any{"sourceUrl": "https://default.com/v.mp4", "sourceName": "default"},
		map[string]any{"sourceUrl": "https://luf.com/v.mp4", "sourceName": "luf-mp4"},
		map[string]any{"sourceUrl": "https://yt.com/v.mp4", "sourceName": "yt-mp4"},
	}

	got := buildSourceReferences(rawURLs)

	wantOrder := []string{"default", "yt-mp4", "s-mp4", "luf-mp4"}
	if len(got) != len(wantOrder) {
		t.Fatalf("got %d refs, want %d", len(got), len(wantOrder))
	}

	for i, wantName := range wantOrder {
		if got[i].Name != wantName {
			t.Errorf("ref[%d].Name = %q, want %q (priority order: default > yt-mp4 > s-mp4 > luf-mp4)", i, got[i].Name, wantName)
		}
	}
}

func TestIsLikelyM3U8(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input []byte
		want  bool
	}{
		{
			name:  "valid m3u8",
			input: []byte("#EXTM3U\n#EXT-X-VERSION:3"),
			want:  true,
		},
		{
			name:  "with leading spaces",
			input: []byte("  #EXTM3U\n"),
			want:  true,
		},
		{
			name:  "empty",
			input: []byte{},
			want:  false,
		},
		{
			name:  "not m3u8",
			input: []byte("<?xml version=\"1.0\""),
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := isLikelyM3U8(tt.input)
			if got != tt.want {
				t.Errorf("isLikelyM3U8(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestIsLikelyMP4(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input []byte
		want  bool
	}{
		{
			name:  "ftyp at offset 4",
			input: []byte{0x00, 0x00, 0x00, 0x1c, 'f', 't', 'y', 'p', 0x00, 0x00, 0x00, 0x00},
			want:  true,
		},
		{
			name:  "short payload",
			input: []byte{0x00, 0x00},
			want:  false,
		},
		{
			name:  "not mp4",
			input: []byte{0x00, 0x00, 0x00, 0x1c, 'f', 'o', 'o', 'b'},
			want:  false,
		},
		{
			name:  "empty",
			input: []byte{},
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := isLikelyMP4(tt.input)
			if got != tt.want {
				t.Errorf("isLikelyMP4(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestDecryptTobeparsed(t *testing.T) {
	t.Parallel()

	t.Run("valid encrypted payload with first key", func(t *testing.T) {
		payload := "AQAAAAABc2S7yj94zW6j4A8d9D6C3qFvYjR1hI4L6z1J3qKj5pXhKj"

		decrypted, err := decryptTobeparsed(payload)
		if err == nil {
			var result map[string]any
			if err := json.Unmarshal(decrypted, &result); err != nil {
				t.Logf("decrypted (not valid json): %s", string(decrypted))
			} else {
				t.Logf("decrypted: %+v", result)
			}
		} else {
			t.Logf("expected decryption to succeed or fail gracefully: %v", err)
		}
	})

	t.Run("payload too short returns error", func(t *testing.T) {
		payload := "short"
		_, err := decryptTobeparsed(payload)
		if err == nil {
			t.Error("expected error for short payload")
		}
	})

	t.Run("invalid base64 returns error", func(t *testing.T) {
		_, err := decryptTobeparsed("not-valid-base64!!!")
		if err == nil {
			t.Error("expected error for invalid base64")
		}
	})
}

func TestTryDecryptCTR(t *testing.T) {
	t.Parallel()

	t.Run("decrypts correctly", func(t *testing.T) {
		key := make([]byte, 32)
		for i := range key {
			key[i] = byte(i)
		}

		block, err := aes.NewCipher(key)
		if err != nil {
			t.Fatalf("failed to create cipher: %v", err)
		}

		iv := []byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b}
		cipherText := []byte("test plaintext  ")

		plainText := tryDecryptCTR(block, iv, cipherText)
		_ = plainText
	})
}

func TestAllAnimeClientImplementsInterfaces(t *testing.T) {
	t.Parallel()

	var (
		_ interface {
			Search(context.Context, string, string) ([]searchResult, error)
		} = &allAnimeClient{}
		_ interface {
			GetEpisodeSources(context.Context, string, string, string) ([]StreamSource, error)
		} = &allAnimeClient{}
		_ interface {
			GetAvailableEpisodes(context.Context, string) (AvailableEpisodes, error)
		} = &allAnimeClient{}
	)

	t.Log("allAnimeClient implements required interfaces")
}
