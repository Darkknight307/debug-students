#!/usr/bin/env bash
# Жарыс бетін қолмен/браузерде тексеру: мок дерекқор (:4466) + Next.js (:3101).
# Өз build қалтасы бар — негізгі dev-сервермен (:3000) қатар жүре алады.
cd "$(dirname "$0")/../.."
node tests/contest/mock-db.mjs & MOCK_PID=$!
trap 'kill $MOCK_PID 2>/dev/null' EXIT
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4466 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon \
  SUPABASE_SERVICE_ROLE_KEY=svc SESSION_SECRET=e2e-secret-e2e-secret-e2e-secret-000 NEXT_DIST_DIR=node_modules/.cache/next-mock \
  exec npx next dev -p 3101
