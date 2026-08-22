FROM oven/bun:1.4.0 AS build

WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/api build

FROM oven/bun:1.4.0-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=bun:bun /app/apps/api/dist ./dist

USER bun
EXPOSE 3000

CMD ["bun", "dist/index.js"]
