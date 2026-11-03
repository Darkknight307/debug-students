#!/usr/bin/env bash
# Playwright-ты Docker Compose стегіне қарсы толық жүргізу (#56): құрастыру → көтеру (healthy) → тест → down -v.
#   npm run test:pw:compose [-- playwright аргументтері, мысалы --project=desktop e2e/features/02-register.spec.ts]
# E2E_NO_BUILD=1 — бейне бұрын құрастырылған болса (CI), қайта құрастырмайды.
set -u
cd "$(dirname "$0")/.."
export E2E_PORT="${E2E_PORT:-3300}"
export E2E_BASE_URL="http://localhost:${E2E_PORT}"
COMPOSE=(docker compose -p debug-e2e -f compose.yml -f compose.e2e.yml)
cleanup() { "${COMPOSE[@]}" down -v --remove-orphans > /dev/null 2>&1; }
trap cleanup EXIT

BUILD=(--build); [ "${E2E_NO_BUILD:-}" = "1" ] && BUILD=()
if ! "${COMPOSE[@]}" up -d "${BUILD[@]}" --wait; then
  "${COMPOSE[@]}" logs app | tail -60
  exit 1
fi
npx playwright test "$@"
code=$?
[ "$code" -ne 0 ] && "${COMPOSE[@]}" logs app | tail -80
exit "$code"
