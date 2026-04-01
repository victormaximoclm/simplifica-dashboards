FROM node:20-alpine AS base

# ── Dependencies ─────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY src/prisma/schema.prisma ./src/prisma/schema.prisma
COPY src/assets/iconify-icons/bundle-icons-css.mjs ./src/assets/iconify-icons/bundle-icons-css.mjs

RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ── Builder ──────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for Next.js public env vars (baked at build time)
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm && pnpm build

# ── Runner ───────────────────────────────────
FROM base AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema + migrations for runtime migrate
COPY --from=builder /app/src/prisma ./src/prisma
COPY --from=builder /app/node_modules/.pnpm/@prisma+client@6.19.1_prisma@6.19.0_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.pnpm/prisma@6.19.0_typescript@5.9.3/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

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
