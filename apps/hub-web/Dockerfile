# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifest and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package manifests for workspace packages hub-web depends on
COPY packages/shared/package.json ./packages/shared/
COPY packages/game-renderer/package.json ./packages/game-renderer/
COPY apps/hub-web/package.json ./apps/hub-web/

RUN pnpm install --frozen-lockfile


# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/game-renderer/node_modules ./packages/game-renderer/node_modules
COPY --from=deps /app/apps/hub-web/node_modules ./apps/hub-web/node_modules

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/game-renderer ./packages/game-renderer
COPY apps/hub-web ./apps/hub-web

# Build workspace packages in dependency order, then the Vite app
RUN pnpm --filter @agentic-island/shared build && \
    pnpm --filter @agentic-island/game-renderer build && \
    pnpm --filter @agentic-island/hub-web build


# ─── Stage 3: Serve with nginx ───────────────────────────────────────────────
FROM nginx:alpine AS runner

# SPA routing: serve index.html for all non-file routes
COPY --from=builder /app/apps/hub-web/dist /usr/share/nginx/html

RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Cache static assets aggressively\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
