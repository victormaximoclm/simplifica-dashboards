#!/bin/sh
set -e

PRISMA_CLI="node /app/prisma-cli/node_modules/prisma/build/index.js"

echo "==> Running Prisma migrations..."
#$PRISMA_CLI migrate deploy --schema src/prisma/schema.prisma

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "==> Running seed..."
  node src/prisma/seed.js --production || echo "==> Seed skipped"
fi

echo "==> Starting application..."
exec node server.js
