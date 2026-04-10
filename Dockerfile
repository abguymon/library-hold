# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

# ──────────────────────────────────────────────
# Stage 1: install web dependencies
# ──────────────────────────────────────────────
FROM base AS deps
WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

# ──────────────────────────────────────────────
# Stage 2: build
# ──────────────────────────────────────────────
FROM base AS builder
WORKDIR /repo
# Copy everything the build needs
COPY lib/ ./lib/
COPY data/ ./data/
COPY web/ ./web/
COPY --from=deps /repo/web/node_modules ./web/node_modules

WORKDIR /repo/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ──────────────────────────────────────────────
# Stage 3: production image
#
# Standalone output structure:
#   .next/standalone/
#     data/picture-books.json   ← traced automatically
#     web/
#       server.js               ← Next.js server entry
#       node_modules/           ← minimal deps
#       .next/                  ← server bundles
# ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# picture-books.json path inside the container (traced into /app/data/)
ENV BOOKS_BUNDLE_PATH=/app/data/picture-books.json

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (includes data/ and web/)
COPY --from=builder --chown=nextjs:nodejs /repo/web/.next/standalone ./
# Static assets and public dir must be copied separately
COPY --from=builder --chown=nextjs:nodejs /repo/web/.next/static ./web/.next/static

# Create data directory for runtime book tracking (BOOKS_DATA_PATH volume)
RUN mkdir -p /data && chown nextjs:nodejs /data
# Create config directory for auth token persistence
RUN mkdir -p /root/.library-hold && chown nextjs:nodejs /root/.library-hold

USER nextjs
WORKDIR /app/web
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
