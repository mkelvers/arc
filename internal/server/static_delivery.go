package server

import (
	"mime"
	"net/http"
	"path/filepath"
	"strings"
)

//nolint:unused
func addVary(header http.Header, value string) {
	for _, line := range header.Values("Vary") {
		for _, existing := range strings.Split(line, ",") {
			if strings.EqualFold(strings.TrimSpace(existing), value) {
				return
			}
		}
	}
	header.Add("Vary", value)
}

//nolint:unused
func isCompressibleContentType(value string) bool {
	mediaType, _, err := mime.ParseMediaType(value)
	if err != nil {
		mediaType = strings.TrimSpace(strings.Split(value, ";")[0])
	}
	mediaType = strings.ToLower(mediaType)
	if strings.HasPrefix(mediaType, "text/") || strings.HasSuffix(mediaType, "+json") || strings.HasSuffix(mediaType, "+xml") {
		return true
	}
	switch mediaType {
	case "application/javascript", "application/json", "application/manifest+json", "application/x-javascript", "application/xhtml+xml", "application/xml", "image/svg+xml":
		return true
	default:
		return false
	}
}

//nolint:unused
func isCompressedPath(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".7z", ".avif", ".br", ".gif", ".gz", ".ico", ".jpeg", ".jpg", ".m4a", ".m4v", ".mov", ".mp3", ".mp4", ".oga", ".ogg", ".ogv", ".pdf", ".png", ".rar", ".webm", ".webp", ".woff", ".woff2", ".zip":
		return true
	default:
		return false
	}
}

func isImagePath(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp":
		return true
	default:
		return false
	}
}

//nolint:unused
func staticCachePolicy(r *http.Request) string {
	path := r.URL.Path
	switch {
	case strings.HasPrefix(path, "/dist/"):
		if r.URL.Query().Get("v") != "" {
			return "public, max-age=31536000, immutable"
		}
		return "public, max-age=0, must-revalidate"
	case strings.HasPrefix(path, "/static/assets/") && isImagePath(path):
		return "public, max-age=86400"
	default:
		return ""
	}
}
