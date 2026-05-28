package internal

import (
	"net/url"
	"strings"
)

func DefaultAvatarURL(username string) string {
	seed := url.QueryEscape(strings.TrimSpace(username))
	return "https://api.dicebear.com/9.x/dylan/svg?seed=" + seed
}
