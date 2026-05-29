# cmd

Application entrypoints.

| binary       | purpose                           |
| ------------ | --------------------------------- |
| `cmd/server` | HTTP server and worker processes  |
| `cmd/user`   | User management CLI               |

## Conventions

- Each subdirectory is a `package main` that compiles to a standalone binary.
- Shared logic lives in `internal/` or `pkg/`, not in `cmd/`.
- Configuration is read from environment variables — see each binary's `main.go` for the full list.
