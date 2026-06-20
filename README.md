# MyAnimeList

<p align="center">
  <img src="/static/assets/logo.png" alt="MyAnimeList logo" width="120" />
</p>

<p align="center">
  <img alt="Go" src="https://img.shields.io/badge/go-1.25-00ADD8?style=flat-square&logo=go" />
  <img alt="SQLite" src="https://img.shields.io/badge/database-sqlite-003B57?style=flat-square&logo=sqlite" />
  <img alt="Tailwind" src="https://img.shields.io/badge/tailwind-4-06D6D4?style=flat-square&logo=tailwindcss" />
  <img alt="HTMX" src="https://img.shields.io/badge/htmx-partial--updates-3366CC?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
</p>

MyAnimeList is a small self-hosted anime tracker and playback app. It keeps the catalog, watchlist, progress tracking, and player in one place, backed by a single SQLite database and a single Go server.

Most of the UI is rendered on the server. HTMX handles lightweight updates like pagination and watchlist changes, while TypeScript is kept for the parts that need real browser state: the video player, search page, theme handling, and skip segment editor. The app also includes local users, API tokens, subtitle support, playlist rewriting, provider integrations, migrations, and startup data fixes.

## Running

Requires Go `1.25+`, Bun, [`just`](https://github.com/casey/just), and a C compiler for SQLite.

```bash
bun install
just build
go run ./cmd/user <username> <password>
just dev
```

The app starts on `http://localhost:3000` by default. Configuration comes from environment variables, and a local `.env` file is loaded automatically. The most useful options are `PORT`, `DATABASE_FILE`, `PLAYBACK_PROXY_SECRET`, `EPISODE_AVAILABILITY_MODE`, and `ANIMESCHEDULE_API_TOKEN`.

## Development

The codebase is split between Go feature packages, external integrations, server-rendered templates, and a small frontend asset pipeline. `cmd/server` starts the web app, `cmd/user` contains local admin tools, `internal` holds the application modules, `integrations` holds provider clients, and `templates`, `static`, and `dist` contain the UI.

The common development commands are in the `justfile`.

```bash
just fmt
just test
just lint-go
just lint-ts
just typecheck
just build
```

Run the full local check with:

```bash
just check
```

## License

MIT. See [`LICENSE`](LICENSE).
