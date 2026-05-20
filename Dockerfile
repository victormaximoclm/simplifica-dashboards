# Multi-stage: deps → build (standalone) → runner com Prisma CLI para db push no entrypoint.
FROM node:20-alpine AS base

# ── Dependencies ─────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Install deps without running postinstall (needs source files not yet available)
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Builder ──────────────────────────────────
FROM base AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run postinstall scripts now that all source files are available
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN npx prisma generate && pnpm build:icons

# Build arguments for Next.js public env vars (baked at build time)
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ── Prisma CLI (isolated install) ────────────
FROM base AS prisma-cli
WORKDIR /prisma-cli
RUN npm init -y && npm install prisma@6.19.0 && rm -f package.json package-lock.json

# ── Runner ───────────────────────────────────
FROM base AS runner
WORKDIR /app

RUN apk add --no-cache openssl dos2unix

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built standalone (includes production node_modules + server.js)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma schema + seed for runtime db push
COPY --from=builder /app/src/prisma ./src/prisma

# Copy entire Prisma CLI install into a separate directory (no merge conflicts)
COPY --from=prisma-cli /prisma-cli/node_modules /app/prisma-cli/node_modules
RUN mkdir -p /app/prisma-cli/node_modules/.bin \
    && ln -sf ../prisma/build/index.js /app/prisma-cli/node_modules/.bin/prisma

# Ensure bcryptjs is available for seed.js (standalone may not include it)
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Copy entrypoint and fix Windows line endings
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN dos2unix ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

# Set ownership for the nextjs user
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
