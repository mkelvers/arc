# MyAnimeList

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="/static/assets/readme-logo-dark.svg" />
    <img src="/static/assets/readme-logo-light.svg" alt="MyAnimeList logo" width="120" />
  </picture>
  <br />
  <em>My personal anime tracker, built because nothing else felt right.</em>
</p>

<p align="center">
  <img alt="Go" src="https://img.shields.io/badge/go-1.25-00ADD8?style=flat-square&logo=go" />
  <img alt="SQLite" src="https://img.shields.io/badge/database-sqlite-003B57?style=flat-square&logo=sqlite" />
  <img alt="Tailwind" src="https://img.shields.io/badge/tailwind-4-06D6D4?style=flat-square&logo=tailwindcss" />
  <img alt="HTMX" src="https://img.shields.io/badge/htmx-partial--updates-3366CC?style=flat-square" />
</p>

I was frustrated with every anime tracker I tried. Decent UI but awkward UX. Good features but missing the ones I actually use. So I built my own: search fast, get context fast, update your status fast, and move on.

This project is personal first — I put it on GitHub because I like shipping in the open. It also doubles as proof that a small, server-rendered Go app can stay reliable even when upstream anime APIs are inconsistent.

- **Catalog browsing & seasonal discovery** — explore what's airing, filter by season
- **Quick search** — find anime, get mal links, open the detail page in seconds
- **Detail pages** — synopsis, stats, recommendations, related entries
- **Watchlist management** — track your progress across statuses
- **Continue watching** — pick up where you left off
- **In-app playback** — proxy-based video player

## Technical approach

Written in Go with server-rendered `html/template`, SQLite + `sqlc` for typed queries, Tailwind CSS v4 for styling, and HTMX backed by small TypeScript modules for incremental interactions.

The external anime data source is [Jikan](https://api.jikan.moe/v4). The client layer handles request pacing, bounded retries, backoff, stale-cache fallback, and a persisted retry queue. Playback proxying uses uTLS to bypass Cloudflare. The system is built to degrade gracefully under `429` and `5xx` responses rather than fail hard.

## Repository structure

| Path              | Purpose                                          |
| ----------------- | ------------------------------------------------ |
| `api/*`           | Feature routes: anime, auth, playback, watchlist |
| `cmd/server`      | Application entrypoint and CLI commands          |
| `integrations/*`  | External API clients and scraping                |
| `internal/*`      | Core services: db, middleware, server, worker    |
| `pkg/middleware`  | Generic HTTP middleware                          |
| `templates/*`     | Server-rendered HTML templates                   |
| `migrations`      | Schema evolution                                 |
| `static` / `dist` | Frontend assets                                  |

## Running locally

Requires Go `1.25+`, Bun, and [just](https://github.com/casey/just). Migrations run on startup. Configuration lives in environment variables — see `cmd/server/main.go` for the full list.

```bash
just dev
```

## Contributing

Bug reports and pull requests are welcome. This is a personal project, so there is no strict roadmap or issue triage cycle. If something is broken or missing, open an issue or send a PR.

## License

MIT. See `LICENSE`.
