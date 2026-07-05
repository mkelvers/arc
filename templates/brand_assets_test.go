package templates

import (
	"encoding/json"
	"image/png"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

type manifestIcon struct {
	Src   string `json:"src"`
	Sizes string `json:"sizes"`
}

func TestManifestIconDimensions(t *testing.T) {
	data, err := os.ReadFile("../static/assets/manifest.json")
	if err != nil {
		t.Fatalf("read manifest: %v", err)
	}

	var manifest struct {
		Icons []manifestIcon `json:"icons"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("parse manifest: %v", err)
	}
	if len(manifest.Icons) == 0 {
		t.Fatal("manifest has no icons")
	}

	for _, icon := range manifest.Icons {
		t.Run(icon.Sizes, checkManifestIcon(icon))
	}
}

func checkManifestIcon(icon manifestIcon) func(*testing.T) {
	return func(t *testing.T) {
		width, height := parseIconSize(t, icon.Sizes)
		assetURL, err := url.Parse(icon.Src)
		if err != nil {
			t.Fatalf("parse icon URL: %v", err)
		}
		if assetURL.Query().Get("v") == "" {
			t.Fatalf("icon URL is not versioned: %q", icon.Src)
		}

		file, err := os.Open(filepath.Join("..", strings.TrimPrefix(assetURL.Path, "/")))
		if err != nil {
			t.Fatalf("open icon: %v", err)
		}
		defer file.Close()

		config, err := png.DecodeConfig(file)
		if err != nil {
			t.Fatalf("decode icon: %v", err)
		}
		if config.Width != width || config.Height != height {
			t.Fatalf("icon dimensions = %dx%d, manifest declares %s", config.Width, config.Height, icon.Sizes)
		}
	}
}

func TestFirstLoadBrandAssetSizes(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		width    int
		height   int
		maxBytes int64
	}{
		{name: "navigation logo", path: "../static/assets/logo-128.png", width: 166, height: 128, maxBytes: 25 * 1024},
		{name: "32px favicon", path: "../static/assets/favicon-32.png", width: 32, height: 32, maxBytes: 20 * 1024},
		{name: "16px favicon", path: "../static/assets/favicon-16.png", width: 16, height: 16, maxBytes: 20 * 1024},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file, err := os.Open(tt.path)
			if err != nil {
				t.Fatalf("open asset: %v", err)
			}
			defer file.Close()

			info, err := file.Stat()
			if err != nil {
				t.Fatalf("stat asset: %v", err)
			}
			if info.Size() > tt.maxBytes {
				t.Fatalf("asset size = %d bytes, max %d", info.Size(), tt.maxBytes)
			}

			config, err := png.DecodeConfig(file)
			if err != nil {
				t.Fatalf("decode asset: %v", err)
			}
			if config.Width != tt.width || config.Height != tt.height {
				t.Fatalf("asset dimensions = %dx%d, want %dx%d", config.Width, config.Height, tt.width, tt.height)
			}
		})
	}
}

func parseIconSize(t *testing.T, value string) (int, int) {
	t.Helper()
	widthValue, heightValue, ok := strings.Cut(value, "x")
	if !ok {
		t.Fatalf("invalid icon size %q", value)
	}
	width, err := strconv.Atoi(widthValue)
	if err != nil {
		t.Fatalf("parse icon width: %v", err)
	}
	height, err := strconv.Atoi(heightValue)
	if err != nil {
		t.Fatalf("parse icon height: %v", err)
	}
	return width, height
}
