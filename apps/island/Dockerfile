# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package manifests for workspace packages island depends on
COPY packages/shared/package.json ./packages/shared/
COPY packages/game-renderer/package.json ./packages/game-renderer/
COPY apps/island/package.json ./apps/island/

RUN pnpm install --frozen-lockfile


# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/game-renderer/node_modules ./packages/game-renderer/node_modules
COPY --from=deps /app/apps/island/node_modules ./apps/island/node_modules

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/game-renderer ./packages/game-renderer
COPY apps/island ./apps/island

# Build shared + game-renderer first, then island
RUN pnpm --filter @agentic-island/shared build && \
    pnpm --filter @agentic-island/game-renderer build && \
    pnpm --filter @agentic-island/island build


# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV WORLD_PORT=3002

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 island

# Compiled output and dependencies
COPY --from=builder --chown=island:nodejs /app/apps/island/dist ./dist
COPY --from=builder --chown=island:nodejs /app/apps/island/node_modules ./node_modules
COPY --from=builder --chown=island:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=island:nodejs /app/packages/game-renderer/dist ./packages/game-renderer/dist
COPY --from=builder --chown=island:nodejs /app/node_modules /app/node_modules

# Static assets needed at runtime
COPY --from=builder --chown=island:nodejs /app/apps/island/DawnLike ./DawnLike
COPY --from=builder --chown=island:nodejs /app/apps/island/config ./config
COPY --from=builder --chown=island:nodejs /app/apps/island/public ./public

USER island

EXPOSE 3002

CMD ["node", "dist/index.js"]
