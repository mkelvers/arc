package templates

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"go.uber.org/fx"
)

// FS is the interface for template filesystem, to be provided by the main app or a mock.
type FS interface {
	ReadFile(name string) ([]byte, error)
	ReadDir(name string) ([]osDirEntry, error)
}

// We will use embed.FS but wrapped in an interface if needed, or just use it directly.
// For now let's assume we pass the root embed.FS to the constructor.

type Renderer struct {
	templates map[string]*template.Template
}

var Module = fx.Options(
	fx.Provide(ProvideRenderer),
)

func ProvideRenderer() (*Renderer, error) {
	// In the final version, this will use an embedded FS.
	// For now, let's keep it working with the local filesystem but as an fx service.
	r := &Renderer{
		templates: make(map[string]*template.Template),
	}

	funcs := template.FuncMap{
		"dict": func(values ...any) map[string]any {
			m := make(map[string]any)
			for i := 0; i < len(values)-1; i += 2 {
				key, ok := values[i].(string)
				if !ok {
					continue
				}
				m[key] = values[i+1]
			}
			return m
		},
		"json": func(v any) template.HTMLAttr {
			b, _ := json.Marshal(v)
			return template.HTMLAttr(b)
		},
		"genresParams": func(genres []int) string {
			if len(genres) == 0 {
				return ""
			}
			var s strings.Builder
			for _, g := range genres {
				s.WriteString("genres=" + fmt.Sprintf("%d", g) + "&")
			}
			return s.String()[:len(s.String())-1]
		},
		"hasGenre": func(id int, genres []int) bool {
			return slices.Contains(genres, id)
		},
		"add": func(a, b int) int {
			return a + b
		},
		"sub": func(a, b int) int {
			return a - b
		},
		"mul": func(a, b float64) float64 {
			return a * b
		},
		"imul": func(a, b int) int {
			return a * b
		},
		"div": func(a, b float64) float64 {
			if b == 0 {
				return 0
			}
			return a / b
		},
		"ceilDiv": func(a, b int) int {
			if b == 0 {
				return 0
			}
			return (a + b - 1) / b
		},
		"toFloat": func(a int) float64 {
			return float64(a)
		},
		"seq": func(v any) []int {
			var count int
			switch n := v.(type) {
			case int:
				count = n
			case int64:
				count = int(n)
			default:
				count = 0
			}
			res := make([]int, count)
			for i := 0; i < count; i++ {
				res[i] = i
			}
			return res
		},
		"min": func(a, b int) int {
			if a < b {
				return a
			}
			return b
		},
		"int": func(v any) int {
			switch n := v.(type) {
			case int:
				return n
			case int64:
				return int(n)
			case float64:
				return int(n)
			case string:
				i, _ := strconv.Atoi(n)
				return i
			default:
				return 0
			}
		},
		"percent": func(current, total float64) float64 {
			if total == 0 {
				return 0
			}
			return (current / total) * 100
		},
	}

	pages, err := filepath.Glob(filepath.Join(".", "templates", "*.gohtml"))
	if err != nil {
		return nil, err
	}

	components, err := filepath.Glob(filepath.Join(".", "templates", "components", "*.gohtml"))
	if err != nil {
		return nil, err
	}

	for _, page := range pages {
		name := filepath.Base(page)
		if name == "base.gohtml" {
			continue
		}

		tmpl := template.New(name).Funcs(funcs)
		tmpl = template.Must(tmpl.ParseFiles(filepath.Join(".", "templates", "base.gohtml")))
		if len(components) > 0 {
			tmpl = template.Must(tmpl.ParseFiles(components...))
		}
		tmpl = template.Must(tmpl.ParseFiles(page))

		r.templates[name] = tmpl
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

func (h HTMLRender) Render(w http.ResponseWriter) error {
	tmpl, ok := h.Renderer.templates[h.Name]
	if !ok {
		return fmt.Errorf("template %s not found", h.Name)
	}

	if block, ok := h.Data.(map[string]any)["_fragment"]; ok {
		if blockStr, ok := block.(string); ok {
			return tmpl.ExecuteTemplate(w, blockStr, h.Data)
		}
	}

	return tmpl.ExecuteTemplate(w, "base.gohtml", h.Data)
}

func (h HTMLRender) WriteContentType(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
}

// ExecuteFragment is for HTMX partials
func (r *Renderer) ExecuteFragment(w io.Writer, name string, block string, data any) error {
	tmpl, ok := r.templates[name]
	if !ok {
		return fmt.Errorf("template %s not found", name)
	}
	return tmpl.ExecuteTemplate(w, block, data)
}
