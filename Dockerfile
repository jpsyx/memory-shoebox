# Memory Shoebox ships as a single container: one Fastify process serves both the API
# and the built web app, so a self-hoster runs one service on one domain.
#
# Build context is the repository root:
#   docker build -t memory-shoebox .
#   fly deploy

# ---------------------------------------------------------------------------
# Stage 1: install dependencies and build the web app.
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder

# better-sqlite3 compiles a native addon when no prebuilt binary matches the
# platform, so the toolchain has to be present while dependencies install. It
# stays behind in this stage and never reaches the image that ships.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

# The repository's postinstall hook restores coding-agent skills. That is a
# developer convenience with no place in a production image.
ENV SKIP_SKILLS_INSTALL=1
ENV NODE_ENV=production

# Copy manifests first so the dependency layer is reused whenever only source
# code changes. The postinstall hook runs on every install, so its wrapper
# script has to be present too.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY scripts scripts

# A full install, including dev dependencies, because the web app needs Vite
# to build.
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @memory-shoebox/web build

# Re-run the install restricted to the server and its workspace dependencies,
# in production mode. This drops every dev dependency (Vite, TypeScript,
# Vitest) while keeping the built web app. CI=true lets pnpm replace the
# modules directory without asking for confirmation on a non-interactive
# terminal.
RUN CI=true pnpm install --frozen-lockfile --prod --filter "@memory-shoebox/server..."

# ---------------------------------------------------------------------------
# Stage 2: the image that ships. No compilers, no package manager, no sources
# the server does not execute.
# ---------------------------------------------------------------------------
FROM node:22-slim

ENV NODE_ENV=production

WORKDIR /app

# pnpm links packages with relative symlinks inside this directory, so copying
# the tree wholesale keeps every one of them valid.
COPY --from=builder /app /app

WORKDIR /app/apps/server

EXPOSE 8080

# The server runs TypeScript directly: Node 22.18+ strips types at load time,
# so there is no server build step and no compiled output to keep in sync.
CMD ["node", "src/index.ts"]
