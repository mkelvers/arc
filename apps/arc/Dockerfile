FROM oven/bun:1.4.0 AS build

WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/arc build

FROM oven/bun:1.4.0-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/arc/package.json apps/arc/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --from=build --chown=bun:bun /app/apps/arc/build ./apps/arc/build

USER bun
EXPOSE 3000

CMD ["bun", "apps/arc/build/index.js"]
