package templates

import (
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"net/http"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"go.uber.org/fx"
)

// Renderer parses and renders embedded `*.gohtml` templates.
type Renderer struct {
	templates map[string]*template.Template
}

var Module = fx.Options(
	fx.Provide(ProvideRenderer),
)

func ProvideRenderer() (*Renderer, error) {
	funcs := template.FuncMap{
		"dict":         dict,
		"json":         jsonAttr,
		"genresParams": genresParams,
		"hasGenre":     hasGenre,
		"add":          func(a, b int) int { return a + b },
		"sub":          func(a, b int) int { return a - b },
		"mul":          func(a, b float64) float64 { return a * b },
		"imul":         func(a, b int) int { return a * b },
		"div":          div,
		"ceilDiv":      ceilDiv,
		"idiv":         idiv,
		"atoi":         atoi,
		"toFloat":      func(a int) float64 { return float64(a) },
		"seq":          seq,
		"min":          func(a, b int) int { return min(a, b) },
		"int":          toInt,
		"percent":      percent,
		"formatDate":   formatDate,
	}

	pages, err := fs.Glob(templateFS, "*.gohtml")
	if err != nil {
		return nil, fmt.Errorf("glob templates: %w", err)
	}
	subpages, err := fs.Glob(templateFS, "anime/*.gohtml")
	if err != nil {
		return nil, fmt.Errorf("glob anime templates: %w", err)
	}
	components, err := fs.Glob(templateFS, "components/*.gohtml")
	if err != nil {
		return nil, fmt.Errorf("glob components: %w", err)
	}

	basePath := "base.gohtml"
	allPages := append(pages, subpages...)

	r := &Renderer{templates: make(map[string]*template.Template, len(allPages))}
	for _, page := range allPages {
		name := path.Base(page)
		if name == path.Base(basePath) {
			continue
		}

		parseList := make([]string, 0, 2+len(components))
		parseList = append(parseList, basePath)
		parseList = append(parseList, components...)
		parseList = append(parseList, page)

		tmpl := template.New(path.Base(basePath)).Funcs(funcs)
		parsed, err := tmpl.ParseFS(templateFS, parseList...)
		if err != nil {
			return nil, fmt.Errorf("parse template %s: %w", name, err)
		}
		r.templates[name] = parsed
	}

	if len(r.templates) == 0 {
		return nil, errors.New("no templates parsed")
	}

	return r, nil
}

func (r *Renderer) Instance(name string, data any) render.Render {
	return HTMLRender{
		Renderer: r,
		Name:     name,
		Data:     data,
	}
}

type HTMLRender struct {
	Renderer *Renderer
	Name     string
	Data     any
}

type templateFragmentData interface {
	TemplateFragment() string
}

func (h HTMLRender) Render(w http.ResponseWriter) error {
	tmpl, ok := h.Renderer.templates[h.Name]
	if !ok {
		return fmt.Errorf("template %s not found", h.Name)
	}

	var block any
	if dataMap, ok := h.Data.(map[string]any); ok {
		block = dataMap["_fragment"]
	} else if ginH, ok := h.Data.(gin.H); ok {
		block = ginH["_fragment"]
	} else if fragmentData, ok := h.Data.(templateFragmentData); ok {
		block = fragmentData.TemplateFragment()
	}

	if blockStr, ok := block.(string); ok && blockStr != "" {
		return tmpl.ExecuteTemplate(w, blockStr, h.Data)
	}

	return tmpl.ExecuteTemplate(w, "base.gohtml", h.Data)
}

func (h HTMLRender) WriteContentType(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
}

func (r *Renderer) ExecuteFragment(w io.Writer, name string, block string, data any) error {
	tmpl, ok := r.templates[name]
	if !ok {
		return fmt.Errorf("template %s not found", name)
	}
	return tmpl.ExecuteTemplate(w, block, data)
}

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

