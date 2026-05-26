set shell := ["bash", "-c"]
set dotenv-load := true

export GOCACHE := justfile_directory() + "/.cache/go-build"

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

build-go:
    go build -o server ./cmd/server

build-css:
    bunx @tailwindcss/cli -i ./static/assets/style.css -o ./dist/tailwind.css

build-ts:
    bun build ./static/player/main.ts --outdir ./dist/static/player --target browser --splitting && bun build ./static/*.ts --outdir ./dist/static --target browser

build: build-go build-css build-ts

typecheck:
    bunx tsc -p tsconfig.json --noEmit

check: lint test typecheck build

install-hooks:
    bunx lefthook install

dev: build
    ./server

clean:
    rm -rf dist/*
    rm -f server

new-data-fix name:
    bun scripts/new-data-fix.ts {{name}}
