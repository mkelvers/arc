# MyAnimeList

<p align="center">
  <img src="/static/assets/logo.png" alt="MyAnimeList logo" width="120" />
</p>

<p align="center">
  <img alt="Go" src="https://img.shields.io/badge/go-1.25-00ADD8?style=flat-square&logo=go" />
  <img alt="SQLite" src="https://img.shields.io/badge/database-sqlite-003B57?style=flat-square&logo=sqlite" />
  <img alt="Bun" src="https://img.shields.io/badge/runtime-bun-000000?style=flat-square&logo=bun" />
  <img alt="Tailwind" src="https://img.shields.io/badge/tailwind-4-06D6D4?style=flat-square&logo=tailwindcss" />
  <img alt="HTMX" src="https://img.shields.io/badge/htmx-partial--updates-3366CC?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
</p>

MyAnimeList is a self-hosted anime tracker, catalog browser, watchlist, and playback app built as a
portfolio-grade full-stack project. It brings the parts of an anime discovery workflow that usually
live across several services into one local application: browsing titles, saving a watchlist,
tracking progress, continuing episodes, reading metadata, finding recommendations, and watching
through a browser player backed by provider integrations.

The project is intentionally built like a small real-world product instead of a throwaway demo. The
backend is a Go application with feature-oriented modules, SQLite persistence, schema migrations,
startup data fixes, provider clients, and tests around the parts that are easy to regress. The UI is
mostly server-rendered with Go templates and enhanced with HTMX where partial updates make sense.
TypeScript is reserved for browser-heavy behavior such as the video player, search interactions,
theme handling, progress updates, subtitles, skip segments, and carousel controls.

## Why This Exists

I made this project to explore what a focused, personal media app can look like when it is treated
with the same care as a production product. Anime tracking is a good problem space because it touches
many practical engineering concerns without needing a large team or cloud platform:

- local authentication and user-owned data
- catalog search, browse filters, details pages, and recommendations
- long-lived state such as watchlists, playback progress, and continue-watching rows
- server-rendered pages with small, deliberate frontend islands
- integration boundaries around external metadata and playback providers
- background refresh policies, cache behavior, migrations, and data repair jobs
- observability, request context, error handling, and testable service boundaries

The goal is not to replace a commercial anime platform. The goal is to show how I think about product
engineering: keeping the architecture understandable, making features feel cohesive, choosing boring
tools where possible, and building enough operational structure that the app feels like it could keep
growing.

## What It Can Do

- Browse and search anime using external catalog data.
- View detail pages with metadata, synopsis, reviews, characters, statistics, related titles, themes,
  and watch-order information.
- Maintain a local watchlist with status-oriented user state.
- Continue watching from stored playback progress.
- Play episodes through an HLS-capable web player.
- Rewrite playlists and proxy playback/subtitle requests through the server.
- Track progress, completion, episode navigation, quality, keyboard controls, and player state in
  TypeScript.
- Support subtitles, subtitle caching, and VTT parsing.
- Manage skip segments and local skip-segment overrides.
- Generate personalized top picks from watchlist taste signals and recommendation data.
- Run SQLite migrations and one-off data fixes as the data model evolves.
- Create local users and run maintenance commands from `cmd/user`.

## Architecture

The repository is organized around product features and integration boundaries:

| Path | Purpose |
| --- | --- |
| `cmd/server` | Application entry point for the web server. |
| `cmd/user` | Local admin and maintenance commands. |
| `internal/anime` | Catalog, details, browse, search, reviews, and recommendations wiring. |
| `internal/auth` | Local authentication, middleware, and user session behavior. |
| `internal/watchlist` | Watchlist handlers, service logic, and persistence access. |
| `internal/playback` | Playback state, progress, proxy tokens, skip segments, and watch data. |
| `internal/episodes` | Episode refresh and provider mapping logic. |
| `internal/database` | SQLite setup, migrations, and startup data fixes. |
| `internal/db` | Generated and helper database access code. |
| `integrations/jikan` | Jikan API client, rate limiting, query helpers, and catalog types. |
| `integrations/playback/allanime` | Playback provider client and extraction logic. |
| `templates` | Server-rendered pages and reusable Go template components. |
| `static` | TypeScript source for client-side interactions and player behavior. |
| `scripts` | Bun-powered development and maintenance scripts. |

The application uses Go for the long-running server, domain services, provider clients, and data
access. SQLite keeps the app simple to run locally while still supporting real schema evolution
through migrations. Bun is used for the frontend toolchain, TypeScript checks, formatting, linting,
and small developer scripts. `mise` pins the tool versions so a fresh checkout can get to a working
environment quickly.

## Technology Choices

- **Go** keeps the backend fast, explicit, and easy to ship as a single binary.
- **Gin** provides HTTP routing and middleware without hiding the request lifecycle.
- **Uber Fx** wires modules together in a way that keeps feature packages independent.
- **SQLite** makes the project self-contained and easy to run without external infrastructure.
- **Goose** manages migrations as the schema changes.
- **Go templates** keep most UI rendering close to the server data model.
- **HTMX** adds small partial updates without turning the app into a full SPA.
- **TypeScript** handles the browser behavior that benefits from strong client-side structure.
- **Tailwind CSS** provides a compact styling workflow.
- **Bun** runs the frontend build, lint, format, and script tasks.
- **mise** pins local tool versions for reproducible development.

## Developer Experience

This project is set up around a small number of repeatable commands. The main workflow is:

```bash
mise install
bun install
just dev
```

`just dev` runs the app through Air, which rebuilds the Go server and frontend assets when relevant
files change. The default server address is `http://localhost:3000`.

Configuration is read from environment variables, and a local `.env` file is loaded automatically.
Useful variables include:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port for the local server. |
| `DATABASE_FILE` | `mal.db` | SQLite database path. |
| `GIN_MODE` | release default | Gin runtime mode. |
| `MAL_CORS_ALLOW_ALL` | disabled | Allows any origin when set to `1`; useful only for local or proxy setups. |
| `PLAYBACK_PROXY_SECRET` | empty | Enables signed playback proxy tokens when set. |
| `EPISODE_AVAILABILITY_MODE` | `auto` | Episode availability strategy: `auto`, `legacy`, or `jikan`. |
| `MAL_JIKAN_TRACE` | disabled | Enables optional Jikan client tracing when truthy. |

## Common Commands

The project uses `just` as the command runner:

| Command | Description |
| --- | --- |
| `just setup` | Install pinned tools with `mise` and install Bun dependencies. |
| `just dev` | Start the local development server with live rebuilds. |
| `just build` | Build the Go server, Tailwind CSS, and TypeScript assets. |
| `just test` | Run the Go test suite. |
| `just fmt` | Format Go code. |
| `bun run format` | Format TypeScript and related frontend files with `oxfmt`. |
| `just lint-go` | Run `golangci-lint` across Go packages. |
| `just lint-ts` | Run type-aware `oxlint` against the TypeScript source. |
| `just typecheck` | Run `tsc` without emitting files. |
| `just check` | Run linting, tests, typechecking, and a full build. |
| `just run` | Build and run the compiled server binary. |
| `just clean` | Remove generated build output. |
| `just new-data-fix name` | Scaffold a new data-fix file. |
| `just run-fixes` | Run registered data fixes through the user command. |
| `just fix-all` | Run the Bun maintenance script for data fixes. |

To create a local user after setup:

```bash
go run ./cmd/user <username> <password>
```

## Quality Bar

The codebase aims for a practical production style:

- feature packages own their handlers, services, repositories, and module wiring;
- external provider behavior is isolated in `integrations`;
- migrations are versioned and committed with the application code;
- template components use named props instead of implicit positional state;
- tests focus on database helpers, provider behavior, rendering helpers, recommendations, playback,
  observability, and request handling;
- linting and typechecking are part of the normal local workflow;
- maintenance scripts are kept in the repo instead of living as undocumented one-off commands.

## Project Status

This is a personal portfolio project and local-first application. It is still evolving, but the repo
is structured to make future work straightforward: add migrations when the data model changes, keep
provider-specific logic behind integration packages, prefer server-rendered flows by default, and use
TypeScript only where browser state is genuinely doing work.

## Community And Security

Please read the project docs before contributing or using code from this repository:

- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) describes the expected standard for respectful
  participation.
- [`SECURITY.md`](SECURITY.md) explains how to report security issues and how this project treats
  sensitive playback, auth, and local data concerns.
- [`LICENSE`](LICENSE) contains the MIT license for this project.

## License

This project is released under the MIT License. See [`LICENSE`](LICENSE) for the full text.
