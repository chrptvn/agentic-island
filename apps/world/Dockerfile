# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package manifests for workspace packages world depends on
COPY packages/shared/package.json ./packages/shared/
COPY packages/game-renderer/package.json ./packages/game-renderer/
COPY apps/world/package.json ./apps/world/

RUN pnpm install --frozen-lockfile


# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/game-renderer/node_modules ./packages/game-renderer/node_modules
COPY --from=deps /app/apps/world/node_modules ./apps/world/node_modules

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/game-renderer ./packages/game-renderer
COPY apps/world ./apps/world

# Build shared + game-renderer first, then world
RUN pnpm --filter @agentic-island/shared build && \
    pnpm --filter @agentic-island/game-renderer build && \
    pnpm --filter @agentic-island/world build


# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV WORLD_PORT=3002

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 world

# Compiled output and dependencies
COPY --from=builder --chown=world:nodejs /app/apps/world/dist ./dist
COPY --from=builder --chown=world:nodejs /app/apps/world/node_modules ./node_modules
COPY --from=builder --chown=world:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=world:nodejs /app/packages/game-renderer/dist ./packages/game-renderer/dist
COPY --from=builder --chown=world:nodejs /app/node_modules /app/node_modules

# Static assets needed at runtime
COPY --from=builder --chown=world:nodejs /app/apps/world/DawnLike ./DawnLike
COPY --from=builder --chown=world:nodejs /app/apps/world/config ./config
COPY --from=builder --chown=world:nodejs /app/apps/world/public ./public

USER world

EXPOSE 3002

CMD ["node", "dist/index.js"]
