set shell := ["bash", "-c"]
set dotenv-load := true

fmt:
    go fmt ./...

lint:
    bun run lint:go

lint-ts:
    bun run lint:ts

lint-go:
    bun run lint:go

test:
    go test ./...

bench:
    go test -bench=. -benchmem -count=5 ./internal/anime/... ./integrations/jikan/... ./internal/playback/...

bench-all:
    go test -bench=. -benchmem ./...

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

dev: build
    @./server

clean:
    rm -rf dist/*
    rm -f server

new-data-fix name:
    bash scripts/new-data-fix.sh {{name}}

run-fixes:
    go run ./cmd/user run-fixes

fix-all:
    bash scripts/fix-all.sh
