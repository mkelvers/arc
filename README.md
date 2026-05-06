# MyAnimeList

<table align="center">
  <tr>
    <td>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="static/readme-logo-dark.svg" />
        <img src="static/readme-logo-light.svg" alt="MyAnimeList logo" width="140" />
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

| Path | Purpose |
| --- | --- |
| `api/*` | Feature routes: anime, auth, playback, watchlist |
| `cmd/server` | Application entrypoint and CLI commands |
| `integrations/*` | External API clients and scraping |
| `internal/*` | Core services: db, middleware, server, worker |
| `pkg/middleware` | Generic HTTP middleware |
| `templates/*` | Server-rendered HTML templates |
| `migrations` | Schema evolution |
| `static` / `dist` | Frontend assets |

## Getting started

For local development, install Go `1.25+` and Bun, then build frontend assets and run the server.

```bash
bun install                                    # Install Bun dependencies
bun run build:css && bun run build:ts          # Build frontend assets (CSS and TypeScript)
PLAYBACK_PROXY_SECRET="your-32+char-secret" go run ./cmd/server  # Run the Go server
```

The frontend pipeline uses Tailwind CSS v4 (`static/style.css`) and TypeScript sources in `static/*.ts`, then emits build artifacts into `dist/` for serving.

When the server starts, the app is available at `http://localhost:3000`.

### Creating a user

The app has no public registration. Use the built-in CLI command to create a user:

```bash
go run ./cmd/server create-user <username> <password>
# or with a built binary:
./server create-user <username> <password>
```

If the username already exists, you will be prompted to confirm overwriting the password.

### Justfile

Common tasks are automated via the `justfile`. Run `just <task>` after installing [`just`](https://github.com/casey/just):

| Task | Description |
| --- | --- |
| `just fmt` | Format Go code |
| `just lint` | Run go fmt and go vet |
| `just test` | Run Go tests |
| `just build` | Full build (Go binary, CSS, TS) |
| `just check` | Run all checks (lint, test, typecheck, build) |
| `just dev` | Build and start the server |
| `just install-hooks` | Install lefthook pre-push hooks |

For containerized usage:

```bash
docker build -t myanimelist .
docker run --rm -p 3000:3000 -e PLAYBACK_PROXY_SECRET="your-32+char-secret" myanimelist
```

For persistent data in containers, set `DATABASE_FILE` to `/app/data/mal.db` and mount a volume:

```bash
docker run --rm \
  -p 3000:3000 \
  -e DATABASE_FILE=/app/data/mal.db \
  -v "$(pwd)/data:/app/data" \
  myanimelist
```

After the container is running, exec into it to create a user:

```bash
docker exec <container> /server create-user <username> <password>
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_FILE` | `mal.db` | SQLite database file path |
| `ENV` | _(empty)_ | Set to `production` to enable secure session cookies |
| `MIGRATIONS_DIR` | _(auto-discovered)_ | Optional explicit path to migration files |
| `PLAYBACK_PROXY_SECRET` | _(required)_ | HMAC secret for signed playback proxy tokens (min 32 chars) |

## Database and testing

Migrations run at startup automatically. Schema history includes auth, watchlist, anime metadata, relation tracking, Jikan cache persistence, and retry-queue support.

There is no CI workflow, so validation is local. Use `just check` to run all checks (lint, test, typecheck, build) or `just install-hooks` to set up the pre-push hook that runs them automatically before each push.

> [!NOTE]
> [`just`](https://github.com/casey/just) must be installed first (e.g. `brew install just`).

Alternatively, run tests manually with:

```bash
go test ./...
```

## Security

Keep secrets out of version control, do not publish real credentials in documentation or screenshots, and report security issues privately before public disclosure.

## License

This project is released under the MIT License. See `LICENSE` for details.
