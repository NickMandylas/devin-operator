# syntax=docker/dockerfile:1

# Single multi-stage Dockerfile for the whole monorepo.
# Build targets:
#   api — apps/api (Next.js control-plane API, port 3001)
#   web — apps/web (Next.js operator console, port 3000)

# ---------------------------------------------------------------------------
# Base: Node with pnpm via corepack
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------
# Dependencies: install the full workspace from the lockfile only
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Build: contracts first, then both Next.js apps (standalone output)
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @superset-devin/contracts build \
 && pnpm --filter @superset-devin/api build \
 && pnpm --filter @superset-devin/web build

# ---------------------------------------------------------------------------
# Runtime: API (slim standalone output)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS api
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/api/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/api/.next/static ./apps/api/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/api/server.js"]

# ---------------------------------------------------------------------------
# Runtime: Web (slim standalone output)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
