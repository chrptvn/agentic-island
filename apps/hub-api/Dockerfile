# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifest and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package manifests for workspace packages hub-api depends on
COPY packages/shared/package.json ./packages/shared/
COPY apps/hub-api/package.json ./apps/hub-api/

RUN pnpm install --frozen-lockfile


# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/hub-api/node_modules ./apps/hub-api/node_modules

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/hub-api ./apps/hub-api

# Build shared package first, then hub-api
RUN pnpm --filter @agentic-island/shared build && \
    pnpm --filter @agentic-island/hub-api build


# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HUB_PORT=3001
ENV HUB_DB_PATH=/data/hub.db
ENV SPRITE_CACHE_DIR=/data/sprites

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hubapi && \
    mkdir -p /data && chown hubapi:nodejs /data

# Copy compiled output and production dependencies
COPY --from=builder --chown=hubapi:nodejs /app/apps/hub-api/dist ./apps/hub-api/dist
COPY --from=builder --chown=hubapi:nodejs /app/apps/hub-api/node_modules ./apps/hub-api/node_modules
COPY --from=builder --chown=hubapi:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=hubapi:nodejs /app/node_modules ./node_modules

USER hubapi

EXPOSE 3001

WORKDIR /app/apps/hub-api

CMD ["node", "dist/index.js"]
