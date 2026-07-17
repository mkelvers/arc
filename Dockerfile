FROM golang:1.25-bookworm AS builder

WORKDIR /app

ENV CGO_ENABLED=0

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  unzip \
  && rm -rf /var/lib/apt/lists/*

# Install bun (for building frontend assets)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

ENV GOPROXY=direct
COPY go.mod go.sum ./
RUN go mod download

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy all source files
COPY . .

# Ensure dist is clean at build time (belt + suspenders)
RUN rm -rf dist/ && bun run build:assets && bun run build:ts

# Build the server and CLI tools
RUN go build -ldflags="-s -w" -o main_server ./cmd/server

FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/main_server .
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static
COPY --from=builder /app/dist ./dist

EXPOSE 3000

ENTRYPOINT ["/app/main_server"]
