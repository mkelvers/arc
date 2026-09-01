# arc

an open-source, self-hosted anime tracking and playback app.

built with sveltekit, typescript, drizzle, and postgres. runs on bun.

## structure

```
apps/arc        # the web frontend (sveltekit)
apps/api        # the http api (hono)
apps/scheduler  # background episode sync
packages/
  backend      # business logic
  db           # drizzle migrations + queries
  shared       # shared types and utilities
  api-contract # openapi / graphql schema
```

## run it

```sh
cp apps/arc/.env.example apps/arc/.env   # edit as needed
docker compose up -d                    # postgres + scheduler
bun install
bun run db:up && bun run db:migrate     # wait for postgres, then migrate
bun run dev                             # starts api (3000) + arc (5173)
```
