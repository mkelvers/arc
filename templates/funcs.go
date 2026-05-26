package templates

import (
	"encoding/json"
	"fmt"
	"html/template"
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

