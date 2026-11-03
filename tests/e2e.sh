#!/usr/bin/env bash
# Барлық e2e жиынтығы екі режимде:
#   memory   — MemoryStore;
#   postgres — Prisma + PostgreSQL: TEST_DATABASE_URL ішіндегі уақытша схема (prisma migrate deploy), соңында өшіріледі.
# Бір режимді ғана: E2E_ONLY=postgres npm run test:e2e
set -e
cd "$(dirname "$0")/.."
for DRIVER in ${E2E_ONLY:-memory postgres}; do
  echo "================ E2E · $DRIVER ================"
  export E2E_DRIVER=$DRIVER
  unset E2E_DATABASE_URL
  if [ "$DRIVER" = postgres ]; then
    E2E_DATABASE_URL="$(npx tsx tests/pgSchema.mts create e2e)"
    export E2E_DATABASE_URL
    trap 'npx tsx tests/pgSchema.mts drop "$E2E_DATABASE_URL"' EXIT
  fi
  node tests/contest/e2e.mjs
  bash tests/auth/e2e.sh
  node tests/admin/e2e.mjs
done
