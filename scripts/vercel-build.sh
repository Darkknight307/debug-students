#!/usr/bin/env bash
# Vercel құрастыруы (#50, #67): Prisma клиенті → Neon-ға миграция (pooler-сіз URL) → seed → next build.
# Neon интеграциясы DATABASE_URL (pooler) мен DATABASE_URL_UNPOOLED береді; migrate deploy pooler арқылы жүрмейді.
set -euo pipefail
MIGRATE_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}"
if [ -z "$MIGRATE_URL" ]; then
  echo "DATABASE_URL берілмеген. Vercel → debug-students → Storage → Create Database → Neon → Connect (айнымалылар өзі қосылады)." >&2
  exit 1
fi
npx prisma generate
DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy
npx tsx prisma/seed.ts
npx next build
