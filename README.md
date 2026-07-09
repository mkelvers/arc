# MyAnimeList

<p align="center">
  <img src="/static/assets/logo-128.png" alt="MyAnimeList logo" width="120" />
</p>

<p align="center">
  <strong>A local-first anime catalog, watchlist, recommendation, and playback app.</strong>
</p>

<p align="center">
  <img alt="Go" src="https://img.shields.io/badge/go-1.25-00ADD8?style=flat-square&logo=go" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/database-postgresql-4169E1?style=flat-square&logo=postgresql" />
  <img alt="Bun" src="https://img.shields.io/badge/runtime-bun-000000?style=flat-square&logo=bun" />
  <img alt="Tailwind" src="https://img.shields.io/badge/tailwind-4-06D6D4?style=flat-square&logo=tailwindcss" />
  <img alt="HTMX" src="https://img.shields.io/badge/htmx-partial--updates-3366CC?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
</p>

MyAnimeList is a self-hosted media app for browsing anime, managing a watchlist, resuming episodes,
and playing streams through a browser-based player. It collects the parts of an anime workflow that
usually live across several products and keeps them in one small Go application backed by PostgreSQL
and Redis.

I built it as a portfolio project, but the goal was never to make a disposable demo. The interesting
part of the project is the product shape: server-rendered pages, a local database, provider
integrations, playback proxying, recommendations, migrations, tests, and a TypeScript player that
only appears where browser state actually earns its place.

> [!NOTE]
> This is a personal, local-first project. It is written to demonstrate product engineering choices,
> not to present itself as an official MyAnimeList client or a hosted streaming platform.

### Contents

- [What This Project Is](#what-this-project-is)
- [What It Includes](#what-it-includes)
- [How It Is Built](#how-it-is-built)
- [Working Locally](#working-locally)
- [Repository Map](#repository-map)

### What This Project Is

This project started from a simple idea: anime tracking becomes more interesting when catalog data,
personal progress, and playback live in the same interface. A user should be able to discover a
title, inspect its metadata, add it to a watchlist, watch an episode, come back later, and continue
from the right place without stitching that flow together manually.

That makes the app a useful playground for real application concerns. It has authentication,
long-lived user state, external APIs, background refresh behavior, migrations, data fixes, cache
boundaries, provider-specific code, and enough frontend complexity to justify TypeScript without
turning the whole product into a single-page app.

The project is also intentionally modest. It uses a single Go server with PostgreSQL for durable
application state and Redis for provider responses and stale-data windows. The architecture is more
about clear ownership than novelty: feature packages own their handlers and services, integrations
stay at the edges, and the UI is mostly rendered by the server.

### What It Includes

| Area            | What it does                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Catalog         | Browse, search, and inspect anime metadata from external catalog sources.                                    |
| Details         | Render synopsis, characters, relations, and watch-order data.                                                 |
| Watchlist       | Store local user state for saved titles, statuses, and progress-driven flows.                                |
| Playback        | Serve watch pages, proxy streams/subtitles, rewrite playlists, and track progress.                           |
| Player          | Handle HLS playback, quality selection, subtitles, keyboard controls, episode navigation, and skip segments. |
| Recommendations | Generate personal top picks from watchlist signals and recommendation data.                                  |
| Maintenance     | Run migrations, startup fixes, local user commands, and data repair scripts.                                 |

<details>
<summary><strong>Implementation notes</strong></summary>

The backend is written in Go with Gin for HTTP routing and Fx for module wiring. PostgreSQL stores
durable application state and Redis owns provider-response caching, with migrations committed
alongside the application. Templates are rendered on the server, HTMX handles small partial updates,
and TypeScript powers the interactive parts of the browser experience.

The most stateful frontend code lives under `static/player`, where the app handles playback mode,
source loading, progress storage, subtitles, timelines, quality changes, keyboard shortcuts, skip
segments, episode completion, and thumbnail navigation.

</details>

### How It Is Built

The application is organized around product boundaries rather than framework layers.
`internal/anime` owns catalog-facing behavior, `internal/watchlist` owns saved user state,
`internal/playback` owns watch data and proxy behavior, and `integrations` contains provider
clients. This keeps the core app from depending directly on the details of a specific metadata or
playback source.

Server-rendered templates are the default because most pages are content-heavy and benefit from
simple request-response rendering. TypeScript is used where the browser has real ongoing state:
search interactions, theme handling, carousels, watchlist actions, toast messages, and especially
the video player.

The result is a codebase that behaves like a small product rather than a tutorial project: it has a
repeatable toolchain, database evolution, local maintenance commands, focused tests, and a clear
split between app code and external integrations.

### Working Locally

The local workflow assumes [`mise`](https://mise.jdx.dev/) for tool versions and `just` for common
commands.

```bash
mise install
bun install
just dev
```

The development server runs on `http://localhost:3000` by default. `just dev` uses Air to rebuild
the Go server and frontend assets when relevant files change.

Playback proxying requires a local `PLAYBACK_PROXY_SECRET` so the server can mint stream and
subtitle proxy tokens. Generate a strong value and add it to `.env` before using playback:

```bash
echo "PLAYBACK_PROXY_SECRET=$(openssl rand -base64 32)" >> .env
```

Create a local user with:

```bash
go run ./cmd/user <username> <password>
```

To migrate an existing SQLite database into PostgreSQL, set `DATABASE_FILE` to the SQLite source and
`DATABASE_URL` to the PostgreSQL target, then run:

```bash
go run ./cmd/migrate-db
```

Durable account, watchlist, progress, and history data is imported. Provider caches are intentionally
not copied; AniList, ChiaKi, AllAnime, and TVMaze responses are rebuilt in Redis as needed.

#### Commands

| Command                         | Use it for                                          |
| ------------------------------- | --------------------------------------------------- |
| `just setup`                    | Install pinned tools and Bun dependencies.          |
| `just dev`                      | Run the app locally with live rebuilds.             |
| `just build`                    | Build the Go binary, CSS, and TypeScript assets.    |
| `just test`                     | Run the Go test suite.                              |
| `just check`                    | Run linting, tests, typechecking, and a full build. |
| `just lint-go` / `just lint-ts` | Run backend or frontend linting separately.         |
| `just typecheck`                | Run TypeScript without emitting files.              |
| `just run`                      | Build and run the compiled server.                  |
| `just clean`                    | Remove generated build output.                      |

<details>
<summary><strong>Configuration</strong></summary>

Configuration is loaded from environment variables, and a local `.env` file is read automatically.

| Variable                    | Default         | Purpose                                                                    |
| --------------------------- | --------------- | -------------------------------------------------------------------------- |
| `PORT`                      | `3000`          | HTTP port for the server.                                                  |
| `DATABASE_FILE`             | `mal.db`        | SQLite source path used only by the one-time migration command.            |
| `DATABASE_URL`              | required        | PostgreSQL connection URL for application persistence.                     |
| `REDIS_URL`                 | `redis://localhost:6379/0` | Provider-response and stale-data cache.                        |
| `ANILIST_URL`               | `https://graphql.anilist.co` | AniList GraphQL metadata endpoint.                         |
| `CHIAKI_URL`                | `https://chiaki.site` | ChiaKi relation and watch-order endpoint.                         |
| `GIN_MODE`                  | release default | Gin runtime mode.                                                          |
| `MAL_CORS_ALLOW_ALL`        | disabled        | Allows any origin when set to `1`; intended for local/proxy setups.        |
| `PLAYBACK_PROXY_SECRET`     | empty           | Secret used to mint playback proxy tokens; required for playback proxying. |

</details>

<details>
<summary><strong>Maintenance commands</strong></summary>

| Command                  | Use it for                                                 |
| ------------------------ | ---------------------------------------------------------- |
| `just new-data-fix name` | Scaffold a new data-fix file.                              |
| `just run-fixes`         | Run registered data fixes through `cmd/user`.              |
| `just fix-all`           | Run the Bun maintenance script for data fixes.             |
| `bun run format`         | Format TypeScript and related frontend files with `oxfmt`. |

</details>

### Public Watchlist JSON

`GET /api/public/users/{user_id}/watchlist` returns a versioned, agent-friendly JSON view of a
user's complete watchlist. It includes status summaries, episode progress,
added/completed/last-watched dates, and localized titles.

`GET /watchlist/export` downloads the current user's watchlist as `watchlist.json`.

This endpoint is intentionally unauthenticated. A deployment that should keep watchlist and
playback data private must restrict access to `/api/public/` at the network or reverse-proxy layer.

### Repository Map

| Path                             | Responsibility                                                  |
| -------------------------------- | --------------------------------------------------------------- |
| `cmd/server`                     | Web server entry point.                                         |
| `cmd/user`                       | Local user and maintenance commands.                            |
| `internal/anime`                 | Catalog, details, browse, search, and recommendations.           |
| `internal/auth`                  | Authentication, middleware, and local user handling.            |
| `internal/watchlist`             | Watchlist handlers, service logic, and persistence.             |
| `internal/playback`              | Watch data, progress, proxy tokens, and skip segments.          |
| `internal/episodes`              | Episode refresh and provider mapping.                           |
| `internal/database`              | PostgreSQL setup, migrations, and SQLite import tooling.        |
| `integrations/anilist`           | AniList GraphQL metadata client and Redis-backed cache.         |
| `integrations/metadata`          | Provider-neutral metadata contracts.                            |
| `integrations/watchorder`        | ChiaKi relation and watch-order client.                         |
| `integrations/playback/allanime` | Playback provider client and extraction logic.                  |
| `templates`                      | Server-rendered pages and reusable components.                  |
| `static`                         | TypeScript source for client-side behavior.                     |
| `scripts`                        | Bun-powered development and maintenance scripts.                |

Released under the [MIT License](LICENSE).
