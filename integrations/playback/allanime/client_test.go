package allanime

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"mal/internal/domain"
	"testing"
)

func isLikelyM3U8(data []byte) bool {
	return bytes.HasPrefix(bytes.TrimSpace(data), []byte("#EXTM3U"))
}

func isLikelyMP4(data []byte) bool {
	if len(data) < 8 {
		return false
	}
	return string(data[4:8]) == "ftyp"
}

type stringTransformTestCase struct {
	name  string
	input string
	want  string
}

type sourceReferencesTestCase struct {
	name     string
	rawURLs  []any
	wantRefs []sourceReference
}

var _ interface {
	GetStreams(context.Context, int, []string, string, string) (*domain.StreamResult, error)
} = (*AllAnimeProvider)(nil)

func runStringTransformTests(t *testing.T, tests []stringTransformTestCase, fn func(string) string) {
	t.Helper()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := fn(tt.input)
			if got != tt.want {
				t.Errorf("got %q for input %q, want %q", got, tt.input, tt.want)
			}
		})
	}
}

func runSourceReferenceTests(t *testing.T, tests []sourceReferencesTestCase) {
	t.Helper()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := sourceRefs(tt.rawURLs)
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

func buildEncryptedTobeparsedPayload(t *testing.T, plaintext []byte) string {
	t.Helper()

	key := sha256.Sum256([]byte(aesKeys[0]))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		t.Fatalf("create cipher: %v", err)
	}

	iv := []byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b}
	ctrIV := append([]byte{}, iv...)
	ctrIV = append(ctrIV, 0x00, 0x00, 0x00, 0x02)

	cipherText := make([]byte, len(plaintext))
	cipher.NewCTR(block, ctrIV).XORKeyStream(cipherText, plaintext)

	raw := append([]byte{1}, iv...)
	raw = append(raw, cipherText...)
	raw = append(raw, make([]byte, 16)...)

	return base64.StdEncoding.EncodeToString(raw)
}

func TestDecodeSourceURL(t *testing.T) {
	t.Parallel()

	tests := []stringTransformTestCase{
		{
			name:  "empty returns empty",
			input: "",
			want:  "",
		},
		{
			name:  "with double prefix stripped",
			input: "--example.com/video.mp4",
			want:  "example.com/video.mp4",
		},
		{
			name:  "hex substitution",
			input: "7aexample",
			want:  "Bexample",
		},
		{
			name:  "mixed substitution",
			input: "79url7a01",
			want:  "AurlB9",
		},
		{
			name:  "clock replacement",
			input: "/clock",
			want:  "/clock.json",
		},
		{
			name:  "no clock replacement if already json",
			input: "/clock.json",
			want:  "/clock.json",
		},
		{
			name:  "complex url",
			input: "--79stream7acom",
			want:  "AstreamBcom",
		},
	}

	runStringTransformTests(t, tests, decodeSourceURL)
}

func TestDetectStreamType(t *testing.T) {
	t.Parallel()

	tests := []stringTransformTestCase{
		{
			name:  "m3u8 extension",
			input: "https://example.com/video.m3u8",
			want:  "m3u8",
		},
		{
			name:  "master m3u8",
			input: "https://example.com/master.m3u8",
			want:  "m3u8",
		},
		{
			name:  "mp4 extension",
			input: "https://example.com/video.mp4",
			want:  "mp4",
		},
		{
			name:  "unknown",
			input: "https://example.com/video.avi",
			want:  "unknown",
		},
		{
			name:  "empty returns unknown",
			input: "",
			want:  "unknown",
		},
		{
			name:  "case insensitive - M3U8",
			input: "https://example.com/MASTER.M3U8",
			want:  "m3u8",
		},
	}

	runStringTransformTests(t, tests, detectStreamType)
}

func TestDetectEmbedType(t *testing.T) {
	t.Parallel()

	tests := []stringTransformTestCase{
		{
			name:  "streamwish",
			input: "https://streamwish.com/e/abc123",
			want:  "embed",
		},
		{
			name:  "streamsb",
			input: "https://streamsb.com/e/abc123",
			want:  "embed",
		},
		{
			name:  "mp4upload",
			input: "https://mp4upload.com/e/abc123",
			want:  "embed",
		},
		{
			name:  "ok.ru",
			input: "https://ok.ru/video/123",
			want:  "embed",
		},
		{
			name:  "gogoplay",
			input: "https://gogoplay.io/embed/123",
			want:  "embed",
		},
		{
			name:  "streamlare",
			input: "https://streamlare.com/e/abc",
			want:  "embed",
		},
		{
			name:  "unknown host",
			input: "https://unknown.com/video",
			want:  "unknown",
		},
	}

	runStringTransformTests(t, tests, detectEmbedType)
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

func TestResolveDirectSourceSkipsEmbeds(t *testing.T) {
	t.Parallel()

	if _, ok := directSource(sourceReference{
		URL:  "https://ok.ru/videoembed/123",
		Name: "ok",
	}); ok {
		t.Fatal("expected embed URL to require extraction")
	}
}

func TestBuildSourceReferences(t *testing.T) {
	t.Parallel()

	tests := []sourceReferencesTestCase{
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

	runSourceReferenceTests(t, tests)
}

func TestBuildSourceReferencesOrder(t *testing.T) {
	t.Parallel()

	rawURLs := []any{
		map[string]any{"sourceUrl": "https://s.com/v.mp4", "sourceName": "s-mp4"},
		map[string]any{"sourceUrl": "https://default.com/v.mp4", "sourceName": "default"},
		map[string]any{"sourceUrl": "https://luf.com/v.mp4", "sourceName": "luf-mp4"},
		map[string]any{"sourceUrl": "https://yt.com/v.mp4", "sourceName": "yt-mp4"},
	}

	got := sourceRefs(rawURLs)

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

func TestParseOKRUSources(t *testing.T) {
	t.Parallel()

	body := `{"flashvars":{"metadata":"{\"hlsManifestUrl\":\"https://vd.example.test/video.m3u8?cmd=videoPlayerCdn\\u0026id=123\"}"}}`

	got := parseOKRUSources(body, allAnimeReferer)
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, want 1", len(got))
	}

	if got[0].URL != "https://vd.example.test/video.m3u8?cmd=videoPlayerCdn&id=123" {
		t.Fatalf("URL = %q", got[0].URL)
	}
	if got[0].Type != "m3u8" {
		t.Fatalf("Type = %q, want m3u8", got[0].Type)
	}
	if got[0].Provider != "ok" {
		t.Fatalf("Provider = %q, want ok", got[0].Provider)
	}
}

func TestDecryptTobeparsed(t *testing.T) {
	t.Parallel()

	t.Run("valid encrypted payload with first key", func(t *testing.T) {
		plaintext := []byte(`{"ok":true,"items":[1,2,3]}`)
		payload := buildEncryptedTobeparsedPayload(t, plaintext)

		decrypted, err := decryptTobeparsed(payload)
		if err != nil {
			t.Fatalf("decryptTobeparsed: %v", err)
		}

		if string(decrypted) != string(plaintext) {
			t.Fatalf("decrypted = %q, want %q", decrypted, plaintext)
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
		plaintext := []byte("test plaintext  ")

		ctrIV := append([]byte{}, iv...)
		ctrIV = append(ctrIV, 0x00, 0x00, 0x00, 0x02)
		cipherText := make([]byte, len(plaintext))
		cipher.NewCTR(block, ctrIV).XORKeyStream(cipherText, plaintext)

		got := tryDecryptCTR(block, iv, cipherText)
		if !bytes.Equal(got, plaintext) {
			t.Fatalf("tryDecryptCTR() = %q, want %q", got, plaintext)
		}
	})
}
