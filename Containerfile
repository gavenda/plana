# Single image running both the Discord gateway client and the SSR dashboard.
# Works with `podman build` and `docker build` alike.

ARG BUN_VERSION=1.4-alpine

# --- dependencies (including dev, needed to type-check and build) ------------
FROM docker.io/oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- build the client and SSR bundles ---------------------------------------
FROM deps AS build
WORKDIR /app
# vue-tsc patches the TypeScript compiler through Node's module internals and does
# not run correctly under Bun, so the type-check step needs a real Node binary.
# Build stage only: the runtime image below ships Bun alone.
RUN apk add --no-cache nodejs
COPY . .
RUN bun run build

# --- runtime dependencies only ----------------------------------------------
FROM docker.io/oven/bun:${BUN_VERSION} AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- runtime -----------------------------------------------------------------
FROM docker.io/oven/bun:${BUN_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/plana.db

# The SSR bundle imports vue, vue-router and pinia at runtime, so production
# node_modules must ship with the image.
COPY --from=prod-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --chown=bun:bun src/server ./src/server
COPY --chown=bun:bun package.json ./

# SQLite lives on a volume; the image itself can stay read-only.
RUN mkdir -p /data && chown bun:bun /data
VOLUME ["/data"]

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1

CMD ["bun", "run", "src/server/index.ts"]
