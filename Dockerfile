FROM node:20-alpine AS base

# ── Dependencies ─────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Install deps without running postinstall (needs source files not yet available)
RUN corepack enable pnpm && pnpm install --frozen-lockfile --ignore-scripts

# ── Builder ──────────────────────────────────
FROM base AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run postinstall scripts now that all source files are available
RUN corepack enable pnpm && npx prisma generate && pnpm build:icons

# Build arguments for Next.js public env vars (baked at build time)
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ── Runner ───────────────────────────────────
FROM base AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built output (standalone already includes production node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema for runtime db push
COPY --from=builder /app/src/prisma ./src/prisma

# Install Prisma CLI in isolation (avoids conflicts with standalone package.json)
RUN cd /tmp && npm init -y && npm install prisma@6.19.0 \
    && cp -r /tmp/node_modules/prisma /app/node_modules/prisma \
    && cp -r /tmp/node_modules/@prisma /app/node_modules/@prisma \
    && mkdir -p /app/node_modules/.bin \
    && ln -s ../prisma/build/index.js /app/node_modules/.bin/prisma \
    && rm -rf /tmp/node_modules /tmp/package.json /tmp/package-lock.json

# Copy seed file
COPY --from=builder /app/src/prisma/seed.js ./src/prisma/seed.js

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
