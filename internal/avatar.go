package internal

import (
	"net/url"
	"strings"
)

func DefaultAvatarURL(username string) string {
	params := url.Values{}
	params.Set("seed", strings.TrimSpace(username))
	return "https://api.dicebear.com/9.x/dylan/svg?" + params.Encode()
}
