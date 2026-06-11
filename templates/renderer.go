// Package templates provides HTML template rendering with custom functions.
package templates

import (
	"errors"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"path"

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
	pages, components, err := templatePaths()
	if err != nil {
		return nil, err
	}

	r, err := parseTemplates(pages, components, rendererFuncs())
	if err != nil {
		return nil, err
	}

	if len(r.templates) == 0 {
		return nil, errors.New("no templates parsed")
	}

	return r, nil
}

func rendererFuncs() template.FuncMap {
	return template.FuncMap{
		"dict":              dict,
		"list":              func(items ...any) []any { return items },
		"json":              jsonAttr,
		"browseURL":         browseURL,
		"genresParams":      genresParams,
		"hasGenre":          hasGenre,
		"add":               func(a, b int) int { return a + b },
		"sub":               func(a, b int) int { return a - b },
		"mul":               func(a, b float64) float64 { return a * b },
		"imul":              func(a, b int) int { return a * b },
		"div":               div,
		"ceilDiv":           ceilDiv,
		"idiv":              idiv,
		"atoi":              atoi,
		"toFloat":           func(a int) float64 { return float64(a) },
		"seq":               seq,
		"min":               func(a, b int) int { return min(a, b) },
		"int":               toInt,
		"percent":           percent,
		"formatDate":        formatDate,
		"nextSort":          nextSort,
		"urlquery":          url.QueryEscape,
		"posterURL":         posterURL,
		"episodeRangeStart": episodeRangeStart,
	}
}

func templatePaths() ([]string, []string, error) {
	pages, err := fs.Glob(templateFS, "*.gohtml")
	if err != nil {
		return nil, nil, fmt.Errorf("glob templates: %w", err)
	}

	subpages, err := fs.Glob(templateFS, "anime/*.gohtml")
	if err != nil {
		return nil, nil, fmt.Errorf("glob anime templates: %w", err)
	}

	components, err := fs.Glob(templateFS, "components/*.gohtml")
	if err != nil {
		return nil, nil, fmt.Errorf("glob components: %w", err)
	}

	return append(pages, subpages...), components, nil
}

func parseTemplates(pages []string, components []string, funcs template.FuncMap) (*Renderer, error) {
	const basePath = "base.gohtml"

	r := &Renderer{templates: make(map[string]*template.Template, len(pages))}
	for _, page := range pages {
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
