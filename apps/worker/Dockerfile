FROM oven/bun:1 AS base
WORKDIR /app

# Copia el monorepo completo: el worker depende de packages/core y packages/db
# vía "workspace:*", que bun install resuelve como symlinks locales.
COPY package.json bun.lock ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json

RUN bun install --frozen-lockfile

COPY packages/core packages/core
COPY packages/db packages/db
COPY apps/worker apps/worker

WORKDIR /app/apps/worker
CMD ["bun", "run", "src/index.ts"]
