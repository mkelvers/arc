set shell := ["bash", "-c"]
set dotenv-load := true

fmt:
    go fmt ./...

lint:
    bun run lint

lint-ts:
    bun run lint:ts

lint-go:
    bun run lint:go

bench:
    go test -bench=. -benchmem -count=5 ./internal/anime/... ./internal/playback/...

bench-all:
    go test -bench=. -benchmem ./...

build-go:
    @go build -o server ./cmd/server

build-css:
    @bunx --bun @tailwindcss/cli -i ./static/assets/style.css -o ./dist/tailwind.css

build-ts:
    bun run build:ts

build-ts-dev:
    bun run build:ts:dev

build: build-go build-css build-ts

typecheck:
    bunx tsc -p tsconfig.json --noEmit

check: lint typecheck build

install-hooks:
    bunx lefthook install

setup:
    mise install
    bun install

deps-up:
    @docker compose up -d --wait postgres redis

deps-down:
    @docker compose down

build-dev: build-css build-ts-dev
    @go build -o tmp/server ./cmd/server

dev: deps-up
    @mise exec -- air

run: build
    @./server

clean:
    rm -rf dist/*
    rm -f server
    rm -rf tmp

new-data-fix name:
    bun run ./scripts/new-data-fix.ts {{name}}

run-fixes:
    go run ./cmd/user run-fixes

fix-all:
    bun run ./scripts/fix-all.ts
