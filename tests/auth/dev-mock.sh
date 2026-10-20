#!/usr/bin/env bash
# Тіркелу/кіру беттерін қолмен/браузерде тексеру: мок Supabase Auth (:4455) + Next.js (:3103).
# Email растауды қосу:  curl -X POST localhost:4455/__config -d '{"confirm":true}'
# «Жіберілген» хаттардың сілтемелері: curl localhost:4455/__debug
cd "$(dirname "$0")/../.."
MOCK_SITE=http://localhost:3103 node tests/auth/mock-server.mjs & MOCK_PID=$!
trap 'kill $MOCK_PID 2>/dev/null' EXIT
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4455 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=svc \
  SESSION_SECRET=e2e-secret-e2e-secret-e2e-secret-000 NEXT_PUBLIC_SITE_URL=http://localhost:3103 AUTH_EMAILS_ENABLED=1 \
  NEXT_DIST_DIR=node_modules/.cache/next-auth-mock exec npx next dev -p 3103
