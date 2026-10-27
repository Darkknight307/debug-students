#!/usr/bin/env bash
# Барлық e2e жиынтығы үш режимде:
#   memory — MemoryStore;  sqlite — Prisma + уақытша SQLite файлы (prisma migrate deploy);
#   libsql — Prisma + libSQL адаптері (Turso-дағыдай), уақытша libSQL файлы, миграциялар — scripts/db-migrate-libsql.ts.
# Бір режимді ғана: E2E_ONLY=libsql npm run test:e2e
set -e
cd "$(dirname "$0")/.."
for DRIVER in ${E2E_ONLY:-memory sqlite libsql}; do
  echo "================ E2E · $DRIVER ================"
  export E2E_DRIVER=$DRIVER
  unset E2E_DATABASE_URL
  if [ "$DRIVER" = sqlite ]; then
    export E2E_DATABASE_URL="file:$(mktemp -d)/e2e.db"
    DATABASE_URL="$E2E_DATABASE_URL" npx prisma migrate deploy > /dev/null
  elif [ "$DRIVER" = libsql ]; then
    export E2E_DATABASE_URL="file:$(mktemp -d)/e2e-libsql.db"
    TURSO_DATABASE_URL="$E2E_DATABASE_URL" npx tsx scripts/db-migrate-libsql.ts
  fi
  node tests/contest/e2e.mjs
  bash tests/auth/e2e.sh
  node tests/admin/e2e.mjs
done
