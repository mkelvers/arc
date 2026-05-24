package templates

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"go.uber.org/fx"
)

// FS is the interface for template filesystem, to be provided by the main app or a mock.
type FS interface {
	ReadFile(name string) ([]byte, error)
	ReadDir(name string) ([]os.DirEntry, error)
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
		"idiv": func(a, b int) int {
			if b == 0 {
				return 0
			}
			return a / b
		},
		"atoi": func(v any) int {
			s, ok := v.(string)
			if !ok {
				return 0
			}
			n, err := strconv.Atoi(s)
			if err != nil {
				return 0
			}
			return n
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
		"formatDate": func(dateStr string) string {
			t, err := time.Parse(time.RFC3339, dateStr)
			if err != nil {
				t, err = time.Parse("2006-01-02T15:04:05+00:00", dateStr)
				if err != nil {
					return dateStr
				}
			}
			return t.Format("Jan 2, 2006")
		},
	}

	pages, err := filepath.Glob(filepath.Join(".", "templates", "*.gohtml"))
	if err != nil {
		return nil, err
	}

	subpages, err := filepath.Glob(filepath.Join(".", "templates", "anime", "*.gohtml"))
	if err != nil {
		return nil, err
	}

	allPages := append(pages, subpages...)

	components, err := filepath.Glob(filepath.Join(".", "templates", "components", "*.gohtml"))
	if err != nil {
		return nil, err
	}

	basePath := filepath.Join(".", "templates", "base.gohtml")

	for _, page := range allPages {
		name := filepath.Base(page)
		if name == "base.gohtml" {
			continue
		}

		tmpl := template.New("base.gohtml").Funcs(funcs)
		tmpl = template.Must(tmpl.ParseFiles(basePath))
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

type templateFragmentData interface {
	TemplateFragment() string
}

func (h HTMLRender) Render(w http.ResponseWriter) error {
	tmpl, ok := h.Renderer.templates[h.Name]
	if !ok {
		return fmt.Errorf("template %s not found", h.Name)
	}

	var block any

	// Handle both map[string]any and gin.H (which is map[string]any but might
	// behave differently depending on the Go version/compiler in type assertions)
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

// ExecuteFragment is for HTMX partials
func (r *Renderer) ExecuteFragment(w io.Writer, name string, block string, data any) error {
	tmpl, ok := r.templates[name]
	if !ok {
		return fmt.Errorf("template %s not found", name)
	}
	return tmpl.ExecuteTemplate(w, block, data)
}
