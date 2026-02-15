FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/frontend/package.json ./apps/frontend/

RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules

COPY packages/shared/ ./packages/shared/
COPY apps/frontend/ ./apps/frontend/
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/shared run build
RUN pnpm --filter @flash-sale/frontend run build

# ── Stage 3: Production image (nginx) ────────────────────────────────────────
FROM nginx:alpine

COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
