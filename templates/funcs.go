package templates

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/url"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"time"
)

func dict(values ...any) (map[string]any, error) {
	if len(values)%2 != 0 {
		return nil, fmt.Errorf("dict expects even number of values, got %d", len(values))
	}
	out := make(map[string]any, len(values)/2)
	for i := 0; i < len(values); i += 2 {
		key, ok := values[i].(string)
		if !ok {
			return nil, fmt.Errorf("dict key at index %d is not a string", i)
		}
		out[key] = values[i+1]
	}
	return out, nil
}

func jsonAttr(v any) (template.HTMLAttr, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", fmt.Errorf("json marshal: %w", err)
	}
	return template.HTMLAttr(b), nil
}

func genresParams(genres []int) string {
	if len(genres) == 0 {
		return ""
	}
	var b strings.Builder
	for i, g := range genres {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString("genres=")
		b.WriteString(strconv.Itoa(g))
	}
	return b.String()
}

type browseURLParams struct {
	Query   string
	Type    string
	Status  string
	OrderBy string
	Sort    string
	Studio  any
	SFW     bool
	Genres  []int
	Page    any
}

func browseURL(v any, overrides map[string]any) (string, error) {
	params, ok := v.(browseURLParams)
	if !ok {
		if mapped, mapOK := mapValue(v); mapOK {
			params = browseURLParams{
				Query:   stringValue(mapped["Query"]),
				Type:    stringValue(mapped["Type"]),
				Status:  stringValue(mapped["Status"]),
				OrderBy: stringValue(mapped["OrderBy"]),
				Sort:    stringValue(mapped["Sort"]),
				Studio:  mapped["Studio"],
				SFW:     boolValue(mapped["SFW"]),
				Genres:  intSliceValue(mapped["Genres"]),
				Page:    mapped["Page"],
			}
			ok = true
		}
	}
	if !ok {
		return "", fmt.Errorf("browseURL expects browseURLParams or map[string]any")
	}

	values := url.Values{}
	setQueryValue(values, "q", params.Query)
	setQueryValue(values, "type", params.Type)
	setQueryValue(values, "status", params.Status)
	setQueryValue(values, "order_by", params.OrderBy)
	setQueryValue(values, "sort", params.Sort)
	setQueryValue(values, "studio", stringValue(params.Studio))
	values.Set("sfw", strconv.FormatBool(params.SFW))
	for _, genre := range params.Genres {
		values.Add("genres", strconv.Itoa(genre))
	}
	page := stringValue(params.Page)
	setQueryValue(values, "page", page)

	for key, raw := range overrides {
		switch key {
		case "genres":
			values.Del("genres")
			for _, genre := range intSliceValue(raw) {
				values.Add("genres", strconv.Itoa(genre))
			}
		case "sfw":
			values.Set("sfw", strconv.FormatBool(boolValue(raw)))
		default:
			setQueryValue(values, key, stringValue(raw))
		}
	}

	encoded := values.Encode()
	if encoded == "" {
		return "/browse", nil
	}
	return "/browse?" + encoded, nil
}

func mapValue(v any) (map[string]any, bool) {
	if mapped, ok := v.(map[string]any); ok {
		return mapped, true
	}

	rv := reflect.ValueOf(v)
	if !rv.IsValid() || rv.Kind() != reflect.Map {
		return nil, false
	}
	if rv.Type().Key().Kind() != reflect.String {
		return nil, false
	}

	out := make(map[string]any, rv.Len())
	iter := rv.MapRange()
	for iter.Next() {
		out[iter.Key().String()] = iter.Value().Interface()
	}
	return out, true
}

func setQueryValue(values url.Values, key string, value string) {
	if value == "" {
		values.Del(key)
		return
	}
	values.Set(key, value)
}

func stringValue(v any) string {
	switch value := v.(type) {
	case nil:
		return ""
	case string:
		return value
	case int:
		if value == 0 {
			return ""
		}
		return strconv.Itoa(value)
	case int64:
		if value == 0 {
			return ""
		}
		return strconv.FormatInt(value, 10)
	case float64:
		if value == 0 {
			return ""
		}
		return strconv.Itoa(int(value))
	default:
		return fmt.Sprint(v)
	}
}

func boolValue(v any) bool {
	switch value := v.(type) {
	case bool:
		return value
	case string:
		return value == "true"
	default:
		return false
	}
}

func intSliceValue(v any) []int {
	switch value := v.(type) {
	case []int:
		return value
	case []int64:
		out := make([]int, 0, len(value))
		for _, item := range value {
			out = append(out, int(item))
		}
		return out
	case []any:
		out := make([]int, 0, len(value))
		for _, item := range value {
			n := toInt(item)
			if n > 0 {
				out = append(out, n)
			}
		}
		return out
	default:
		return nil
	}
}

func hasGenre(id int, genres []int) bool {
	return slices.Contains(genres, id)
}

func div(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a / b
}

func ceilDiv(a, b int) int {
	if b == 0 {
		return 0
	}
	return (a + b - 1) / b
}

func idiv(a, b int) int {
	if b == 0 {
		return 0
	}
	return a / b
}

func atoi(v any) int {
	s, ok := v.(string)
	if !ok {
		return 0
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return n
}

func seq(v any) []int {
	count := 0
	switch n := v.(type) {
	case int:
		count = n
	case int64:
		if n > int64(^uint(0)>>1) {
			count = 0
		} else {
			count = int(n)
		}
	}
	if count <= 0 {
		return []int{}
	}
	res := make([]int, count)
	for i := 0; i < count; i++ {
		res[i] = i
	}
	return res
}

func toInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		if n > int64(^uint(0)>>1) {
			return 0
		}
		return int(n)
	case float64:
		if n > float64(int(^uint(0)>>1)) {
			return 0
		}
		return int(n)
	case string:
		i, err := strconv.Atoi(n)
		if err != nil {
			return 0
		}
		return i
	default:
		return 0
	}
}

func percent(current, total float64) float64 {
	if total == 0 {
		return 0
	}
	return (current / total) * 100
}

func formatDate(dateStr string) string {
	t, err := time.Parse(time.RFC3339, dateStr)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05+00:00", dateStr)
		if err != nil {
			return dateStr
		}
	}
	return t.Format("Jan 2, 2006")
}

func nextSort(sort string) string {
	if sort == "asc" {
		return "desc"
	}
	return "asc"
}
