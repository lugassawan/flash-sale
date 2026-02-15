FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

# ── Stage 1: Install all dependencies (needed for build) ────────────────────
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app ./

COPY packages/shared/ ./packages/shared/
COPY apps/backend/ ./apps/backend/
COPY tsconfig.base.json ./

RUN pnpm --filter @flash-sale/shared run build
RUN pnpm --filter @flash-sale/backend run build

# ── Stage 3: Production dependencies only ────────────────────────────────────
FROM base AS prod-deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

# --ignore-scripts: skip root "prepare" (husky) which is a devDependency
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ── Stage 4: Production image ────────────────────────────────────────────────
FROM node:22-alpine

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app

COPY --from=prod-deps /app ./
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

ENV NODE_ENV=production
EXPOSE 3000
USER nestjs

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "apps/backend/dist/main"]
