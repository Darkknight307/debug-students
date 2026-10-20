#!/usr/bin/env bash
# Барлық e2e жиынтығы екі рет: DB_DRIVER=memory және уақытша SQLite файлы (prisma migrate deploy).
set -e
cd "$(dirname "$0")/.."
for DRIVER in memory sqlite; do
  echo "================ E2E · $DRIVER ================"
  export E2E_DRIVER=$DRIVER
  if [ "$DRIVER" = sqlite ]; then
    TMPDB="$(mktemp -d)/e2e.db"; export E2E_DATABASE_URL="file:$TMPDB"
    DATABASE_URL="$E2E_DATABASE_URL" npx prisma migrate deploy > /dev/null
  fi
  node tests/contest/e2e.mjs
  bash tests/auth/e2e.sh
  node tests/admin/e2e.mjs
done
