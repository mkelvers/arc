package jikan

import (
	"fmt"
	"net/url"
	"strconv"
)

func buildRequestURL(baseURL, path string, params url.Values) string {
	encoded := params.Encode()
	if encoded == "" {
		return fmt.Sprintf("%s%s", baseURL, path)
	}

	return fmt.Sprintf("%s%s?%s", baseURL, path, encoded)
}

func setQueryValue(values url.Values, key, value string) {
	if value == "" {
		values.Del(key)
		return
	}

	values.Set(key, value)
}

func setPositiveInt(values url.Values, key string, value int) {
	if value <= 0 {
		values.Del(key)
		return
	}

	values.Set(key, strconv.Itoa(value))
}

func setTrueQueryValue(values url.Values, key string, enabled bool) {
	if !enabled {
		values.Del(key)
		return
	}

	values.Set(key, "true")
}
