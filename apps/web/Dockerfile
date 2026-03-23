# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config and all package manifests
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Copy package manifests for workspace packages the web app depends on
COPY packages/shared/package.json ./packages/shared/
COPY packages/game-renderer/package.json ./packages/game-renderer/
COPY apps/web/package.json ./apps/web/

# Install all dependencies (workspace-aware)
RUN pnpm install --frozen-lockfile


# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/game-renderer/node_modules ./packages/game-renderer/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/game-renderer ./packages/game-renderer
COPY apps/web ./apps/web

# Build packages, then the Next.js app
ARG NEXT_PUBLIC_HUB_API_URL=https://hub.agenticisland.ai
ENV NEXT_PUBLIC_HUB_API_URL=$NEXT_PUBLIC_HUB_API_URL

RUN pnpm --filter @agentic-island/shared build && \
    pnpm --filter @agentic-island/game-renderer build && \
    pnpm --filter @agentic-island/web build


# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone server and static assets
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
