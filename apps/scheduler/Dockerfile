FROM oven/bun:1.4.0 AS build

WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/scheduler build

FROM oven/bun:1.4.0-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=bun:bun /app/apps/scheduler/dist ./dist

USER bun

CMD ["bun", "dist/index.js"]
