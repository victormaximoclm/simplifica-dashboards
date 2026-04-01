#!/bin/sh
set -e

echo "==> Running Prisma migrations..."
node_modules/.bin/prisma db push --schema src/prisma/schema.prisma 2>&1 || {
  echo "==> WARNING: prisma db push failed, retrying in 5s..."
  sleep 5
  node_modules/.bin/prisma db push --schema src/prisma/schema.prisma 2>&1
}

# Run production seed (creates super admin if not exists)
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "==> Running seed (production mode)..."
  node src/prisma/seed.js --production 2>&1 || echo "==> Seed skipped or already applied"
fi

echo "==> Starting application..."
exec node server.js
