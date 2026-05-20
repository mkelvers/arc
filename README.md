# MyAnimeList

<table align="center">
  <tr>
    <td>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="/static/assets/readme-logo-dark.svg" />
        <img src="/static/assets/readme-logo-light.svg" alt="MyAnimeList logo" width="140" />
      </picture>
    </td>
    <td>
      <strong>MyAnimeList</strong><br />
      My personal anime tracker, built because nothing else felt right.
    </td>
  </tr>
</table>

<p align="center">
  <img alt="Go" src="https://img.shields.io/badge/go-1.25-00ADD8?style=flat-square&logo=go" />
  <img alt="SQLite" src="https://img.shields.io/badge/database-sqlite-003B57?style=flat-square&logo=sqlite" />
  <img alt="Tailwind" src="https://img.shields.io/badge/tailwind-4-06B6D4?style=flat-square&logo=tailwindcss" />
  <img alt="HTMX" src="https://img.shields.io/badge/htmx-partial--updates-3366CC?style=flat-square" />
</p>

---

## Why this project exists

I built this for myself.

I was frustrated with the UI and UX of every tracker I tried. Even when something looked decent, it still felt awkward to use day-to-day, or it was missing pieces I considered essential. I wanted one place that matched how I actually watch anime: search fast, get context fast, update status fast, and move on.

So this project is personal first and public second. I put it on GitHub because I like shipping in the open, not because it was originally designed as a general-purpose product for everyone.

Technically, I also wanted to prove that a small, server-rendered Go app could stay reliable even when upstream anime APIs are inconsistent. A lot of this code exists because real APIs rate-limit, timeout, and occasionally fail at the worst possible moment.

## What the application offers

For my own workflow, MyAnimeList combines catalog browsing, seasonal discovery, quick search, detail pages with recommendations and relations, watchlist management, continue-watching, and in-app playback in one server-rendered interface.

The interface is minimal and functional, featuring a dark theme and quick access to tracking tools.

## Technical approach

The application is written in Go and rendered on the server with `html/template`, with SQLite as the primary datastore and `sqlc` for typed query generation. Styling uses Tailwind CSS v4. HTMX and small TypeScript modules handle incremental interactions, which keeps the interface responsive without moving the entire product into a heavy client-side architecture.

The external anime data source is Jikan (`https://api.jikan.moe/v4`). Because reliability is a first-class concern, the client layer includes request pacing, bounded retries, backoff behavior, stale-cache fallback, and a persisted retry queue for failed fetches. Playback proxying uses uTLS to bypass Cloudflare protections.

Upstream APIs can fail transiently with `429` and `5xx` responses, so the app favors graceful degradation over hard failure. Cached values are used when fresh requests fail, retryable failures are persisted and replayed in a background worker, and relation synchronization is incremental so one bad fetch does not block the rest of the graph.

## Repository structure

The codebase follows standard Go project layout conventions.

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

## Getting started

Requires Go `1.25+`, Bun, and [just](https://github.com/casey/just) (`brew install just`).

```bash
git clone https://github.com/mkelvers/mal.git && cd mal
openssl rand -base32 32
PLAYBACK_PROXY_SECRET="your-32-char-secret" go run ./cmd/server
go run ./cmd/user <username> <password>
```

The app runs at `http://localhost:3000`.

### Tasks

The justfile automates common tasks:

```bash
just fmt          # format go code
just lint         # go fmt && go vet
just test         # run go tests
just build        # build go binary + frontend
just check        # lint, test, typecheck, build
just dev          # build and run
just install-hooks   # install pre-push hooks
```

### Docker

```bash
docker build -t mal .
docker run --rm -p 3000:3000 -e PLAYBACK_PROXY_SECRET="$(openssl rand -base32 32)" mal

# persistent data
docker run --rm -p 3000:3000 \
  -e DATABASE_FILE=/app/data/mal.db \
  -e PLAYBACK_PROXY_SECRET="your-secret" \
  -v "$(pwd)/data:/app/data" \
  mal

docker exec mal ./cmd/user <username> <password>
```

## Configuration

| Variable                | Default             | Description                                                 |
| ----------------------- | ------------------- | ----------------------------------------------------------- |
| `PORT`                  | `3000`              | HTTP listen port                                            |
| `DATABASE_FILE`         | `mal.db`            | SQLite database file path                                   |
| `ENV`                   | _(empty)_           | Set to `production` to enable secure session cookies        |
| `MIGRATIONS_DIR`        | _(auto-discovered)_ | Optional explicit path to migration files                   |
| `PLAYBACK_PROXY_SECRET` | _(required)_        | HMAC secret for signed playback proxy tokens (min 32 chars) |
| `MAL_JIKAN_TRACE`       | `false`             | Log all Jikan cache/upstream timings when enabled           |

## Testing

Run locally with `just check` or manually:

```bash
go test ./...
```

Migrations run automatically on startup.

## Security

Keep secrets out of version control, do not publish real credentials in documentation or screenshots, and report security issues privately before public disclosure.

## License

This project is released under the MIT License. See `LICENSE` for details.
