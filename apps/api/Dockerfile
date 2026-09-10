FROM oven/bun:1.4.0 AS build

WORKDIR /app

ENV NODE_ENV=production

COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/api build

FROM oven/bun:1.4.0-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=bun:bun /app/apps/api/dist ./dist
COPY --from=build --chown=bun:bun /app/packages/shared/drizzle /app/packages/shared/drizzle

USER bun
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 CMD ["bun", "-e", "const port = process.env.PORT ?? '3000'; fetch(`http://127.0.0.1:${port}/ready`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", "dist/index.js"]
