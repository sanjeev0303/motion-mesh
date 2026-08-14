FROM node:20-alpine AS base

# ─── Stage 1: install deps ────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy the entire workspace needed for installing client dependencies
COPY client/dashboard/package.json client/dashboard/package-lock.json* ./client/dashboard/
COPY sdk/js/packages/sdk/package.json ./sdk/js/packages/sdk/
COPY sdk/js/packages/player/package.json ./sdk/js/packages/player/

# For local file dependencies, npm ci often needs the actual files to create symlinks
# so we copy the full sdk directory as well.
COPY sdk/js ./sdk/js

WORKDIR /app/sdk/js/packages/sdk
RUN --mount=type=cache,target=/root/.npm \
    npm install && npm run build

WORKDIR /app/sdk/js/packages/player
RUN --mount=type=cache,target=/root/.npm \
    npm install && npm run build

WORKDIR /app/client/dashboard
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ─── Stage 2: build ──────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/client/dashboard/node_modules ./client/dashboard/node_modules
COPY --from=deps /app/sdk ./sdk

COPY client/dashboard ./client/dashboard

WORKDIR /app/client/dashboard

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max_old_space_size=2048"

# Then build the dashboard
RUN --mount=type=cache,target=/root/.npm \
    npm run build

RUN ls -la .next

# ─── Stage 3: minimal production runner ──────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/client/dashboard/public ./public

RUN mkdir .next && chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/client/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/client/dashboard/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
