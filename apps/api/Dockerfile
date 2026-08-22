FROM oven/bun:1.4.0 AS build

WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/api build
RUN bun build packages/db/src/migrate.ts --outdir apps/api/dist --target bun

FROM oven/bun:1.4.0-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=bun:bun /app/apps/api/dist ./dist
COPY --from=build --chown=bun:bun /app/packages/db/drizzle /app/packages/db/drizzle
COPY --chown=bun:bun --chmod=755 apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint

USER bun
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint"]
CMD ["bun", "dist/index.js"]
