# MyAnimeList

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="/static/assets/readme-logo-dark.svg" />
    <img src="/static/assets/readme-logo-light.svg" alt="MyAnimeList logo" width="120" />
  </picture>
</p>

<p align="center">
  <img alt="Go" src="https://img.shields.io/badge/go-1.25-00ADD8?style=flat-square&logo=go" />
  <img alt="SQLite" src="https://img.shields.io/badge/database-sqlite-003B57?style=flat-square&logo=sqlite" />
  <img alt="Tailwind" src="https://img.shields.io/badge/tailwind-4-06D6D4?style=flat-square&logo=tailwindcss" />
  <img alt="HTMX" src="https://img.shields.io/badge/htmx-partial--updates-3366CC?style=flat-square" />
</p>

---

I built this because nothing else felt right. Every tracker I tried had decent pieces but the whole never clicked — awkward UI, missing features, or it just got in the way of actually watching anime. So I built one that fits how I work.

It is a self-hosted Go server that streams anime through a proxy layer, catalogs metadata, and tracks your progress.

The frontend is Tailwind CSS v4 with HTMX handling pagination, infinite scroll, search, and watchlist interactions. TypeScript only steps in where HTMX cannot — the video player, command palette bound to Cmd+K, skip segment editor, theme toggling with system preference detection, and custom UI components. Everything lives in one process, one SQLite database, one deployment.

## Repository structure

| Path              | Purpose                                          |
| ----------------- | ------------------------------------------------ |
| `api/*`           | Feature routes: anime, auth, playback, watchlist |
| `cmd/server`      | Application entrypoint and CLI commands          |
| `cmd/user`        | User management CLI (create, update, delete)     |
| `integrations/*`  | External API clients and scraping                |
| `internal/*`      | Core services: db, middleware, server, worker    |
| `pkg/middleware`  | Generic HTTP middleware                          |
| `templates/*`     | Server-rendered HTML templates                   |
| `migrations`      | Schema evolution (20 migrations)                 |
| `static` / `dist` | Frontend assets                                  |

## Running locally

Requires Go `1.25+`, Bun, and [just](https://github.com/casey/just). Migrations run on startup. Configuration lives in environment variables — see `cmd/server/main.go` for the full list.

The schedule board requires an API key from [animeschedule.net](https://animeschedule.net). Create an account, generate a token under your profile, and set it as `ANIMESCHEDULE_API_TOKEN`.

```bash
just dev
```

## CI

This repo uses Forgejo Actions workflows in `.forgejo/workflows/`:

- `ci.yml`: main PR/push checks (Go + TS)
- `go-deep.yml`: extra Go checks (mod tidy + race)
- `frontend.yml`: frontend-only checks
- `docker.yml`: Docker build verification
- `nightly.yml`: scheduled “full” checks (incl. race + docker build)

Local equivalents:

```bash
gofmt -l .
go test ./...
go build -o server ./cmd/server
golangci-lint run ./...
go mod tidy
go test -race ./...
bunx prettier . --check
bun run lint:ts
bun run typecheck
bun run build:assets
docker build -t mal:ci .
```

## Contributing

Bug reports and pull requests are welcome. This is a personal project, so there is no strict roadmap or issue triage cycle. If something is broken or missing, open an issue or send a PR.

## License

MIT. See `LICENSE`.
