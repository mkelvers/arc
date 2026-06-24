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

test:
    go test ./...
    bun test

bench:
    go test -bench=. -benchmem -count=5 ./internal/anime/... ./integrations/jikan/... ./internal/playback/...

bench-all:
    go test -bench=. -benchmem ./...

e2e:
    bun run test:e2e

build-go:
    @go build -o server ./cmd/server

build-css:
    @bunx --bun @tailwindcss/cli -i ./static/assets/style.css -o ./dist/tailwind.css

build-ts:
    bun run build:ts

build: build-go build-css build-ts

typecheck:
    bunx tsc -p tsconfig.json --noEmit

check: lint test typecheck build

install-hooks:
    bunx lefthook install

setup:
    mise install
    bun install

build-dev: build-css build-ts
    @go build -o tmp/server ./cmd/server

dev:
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
