# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package manifests for workspace packages core depends on
COPY packages/shared/package.json ./packages/shared/
COPY packages/game-renderer/package.json ./packages/game-renderer/
COPY apps/core/package.json ./apps/core/

RUN pnpm install --frozen-lockfile


# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/game-renderer/node_modules ./packages/game-renderer/node_modules
COPY --from=deps /app/apps/core/node_modules ./apps/core/node_modules

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/game-renderer ./packages/game-renderer
COPY apps/core ./apps/core

# Build shared + game-renderer first, then core
RUN pnpm --filter @agentic-island/shared build && \
    pnpm --filter @agentic-island/game-renderer build && \
    pnpm --filter @agentic-island/core build


# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV CORE_PORT=3001

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 core

# Compiled output and dependencies
COPY --from=builder --chown=core:nodejs /app/apps/core/dist ./dist
COPY --from=builder --chown=core:nodejs /app/apps/core/node_modules ./node_modules
COPY --from=builder --chown=core:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=core:nodejs /app/packages/game-renderer/dist ./packages/game-renderer/dist
COPY --from=builder --chown=core:nodejs /app/node_modules /app/node_modules

# Static assets needed at runtime
COPY --from=builder --chown=core:nodejs /app/apps/core/DawnLike ./DawnLike
COPY --from=builder --chown=core:nodejs /app/apps/core/config ./config
COPY --from=builder --chown=core:nodejs /app/apps/core/public ./public

USER core

EXPOSE 3001

CMD ["node", "dist/index.js"]
