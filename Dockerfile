FROM golang:1.25-bookworm AS builder

WORKDIR /app

# Enable CGO for sqlite3
ENV CGO_ENABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  unzip \
  gcc \
  libc6-dev \
  libsqlite3-dev \
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
RUN rm -rf dist/ && bun run build:assets

# Build the server and CLI tools
RUN go build -ldflags="-s -w" -o main_server ./cmd/server
RUN go build -ldflags="-s -w" -o create-user ./cmd/user

FROM debian:bookworm-slim

WORKDIR /app

# Required at runtime (sqlite)
RUN apt-get update && apt-get install -y ca-certificates sqlite3 && rm -rf /var/lib/apt/lists/*

# Create data directory for sqlite
RUN mkdir -p /app/data

# Set DATABASE_FILE to use the persistent volume
ENV DATABASE_FILE=/app/data/mal.db

COPY --from=builder /app/main_server .
COPY --from=builder /app/create-user .
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/internal/database/migrations ./migrations
COPY entrypoint.sh ./entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
