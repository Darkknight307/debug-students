#!/usr/bin/env bash
# Тіркелу мен кірудің толық ағыны: нақты Next.js сервері + Store (E2E_DRIVER=memory|sqlite), хаттар — тест outbox-ында.
# Іске қосу: bash tests/auth/e2e.sh
set -u
cd "$(dirname "$0")/../.."
DRIVER="${E2E_DRIVER:-memory}"
APP_PORT=$([ "$DRIVER" = memory ] && echo 3100 || echo 3110)
B="http://127.0.0.1:$APP_PORT"
TMP="$(mktemp -d)"
JAR="$TMP/cookies.txt"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1 — $2"; }
expect() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "күтілгені [$3], келгені [$2]"; fi; }
contains() { if printf '%s' "$2" | grep -q -- "$3"; then ok "$1"; else bad "$1" "[$3] табылмады"; fi; }
absent() { if printf '%s' "$2" | grep -q -- "$3"; then bad "$1" "[$3] болмауы керек еді"; else ok "$1"; fi; }
# api <path> <json> [extra curl args…] → HTTP коды; дене $TMP/body, тақырыптар $TMP/head
api() { local p="$1" d="$2"; shift 2; curl -s -o "$TMP/body" -D "$TMP/head" -w "%{http_code}" -X POST "$B$p" -H "Content-Type: application/json" -H "X-Forwarded-For: 203.0.113.7" -d "$d" "$@"; }
body() { cat "$TMP/body"; }
hook() { curl -s -X POST "$B/api/test-hooks/$1" -H "Content-Type: application/json" -d "${2:-{\}}" > /dev/null; }
dump() { curl -s "$B/api/test-hooks/dump"; }
py() { python3 -I -c "import json,sys; d=json.load(sys.stdin); $1"; }
last_link() { curl -s "$B/api/test-hooks/outbox" | py "print([m['link'] for m in d if m['to']=='$1'][-1])"; }
REG='{"lastName":"  Серіков ","firstName":"Айдос","university":"Мок университеті","course":"2 курс","phone":"8 701 000 00 01","email":"S1@Mock.Test","password":"fixture-pass-1"}'

cleanup() { kill "$APP_PID" 2>/dev/null; pkill -f "next dev -p $APP_PORT" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

DB_ENV="DB_DRIVER=memory"; [ "$DRIVER" = sqlite ] && DB_ENV="DB_DRIVER=sqlite DATABASE_URL=${E2E_DATABASE_URL}"
env $DB_ENV E2E_TEST_HOOKS=1 NEXT_PUBLIC_SITE_URL="$B" ADMIN_EMAIL=admin@mock.test ADMIN_PASSWORD=admin-pass-123 \
  SESSION_SECRET="e2e-secret-e2e-secret-e2e-secret-000" NEXT_DIST_DIR="node_modules/.cache/next-e2e-auth-$DRIVER" \
  npx next dev -p "$APP_PORT" > "$TMP/app.log" 2>&1 & APP_PID=$!

echo "Next.js іске қосылуда… (DB_DRIVER=$DRIVER)"
for i in $(seq 1 120); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$B/login" || true)
  [ "$code" = "200" ] && break
  sleep 1
done
hook reset

echo "1. Тіркелу өрістерін тексеру"
expect "JSON емес сұраныс → 415" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/auth/register" -H 'Content-Type: text/plain' -d x)" "415"
expect "бос форма → 400 (тегі)" "$(api /api/auth/register '{}')$(body | py 'print(d["field"])')" "400lastName"
expect "email дұрыс емес → 400" "$(api /api/auth/register "${REG/S1@Mock.Test/not-an-email}")$(body | py 'print(d["field"])')" "400email"
expect "құпия сөз 8 таңбадан қысқа → 400" "$(api /api/auth/register "${REG/fixture-pass-1/short}")$(body | py 'print(d["field"])')" "400password"
expect "курс тізімде жоқ → 400" "$(api /api/auth/register "${REG/2 курс/7 курс}")$(body | py 'print(d["field"])')" "400course"
expect "телефон дұрыс емес → 400" "$(api /api/auth/register "${REG/8 701 000 00 01/12345}")$(body | py 'print(d["field"])')" "400phone"
expect "атында цифр → 400" "$(api /api/auth/register "${REG/Айдос/Айдос2}")$(body | py 'print(d["field"])')" "400firstName"
expect "бірде-бір қате сұраныс жол құрмады" "$(dump | py 'print(len(d["users"]))')" "0"

echo "2. Тіркелу → бірден кіреді"
code=$(api /api/auth/register "$REG" -c "$JAR")
expect "тіркелу → 200, loggedIn" "$code $(body | py 'print(d.get("loggedIn"))')" "200 True"
contains "debug_session cookie берілді" "$(cat "$TMP/head")" "debug_session="
contains "cookie HttpOnly" "$(grep -i 'set-cookie' "$TMP/head")" "HttpOnly"
row=$(dump | py 'r=[x for x in d["users"] if x["email"]=="s1@mock.test"][0]; print("|".join([r["full_name"], r["last_name"], r["first_name"], r["university"], r["course"], r["phone"], r["role"]]))')
expect "users жолы: «Тегі Аты», тазаланған, телефон +7…, role=student" "$row" "Серіков Айдос|Серіков|Айдос|Мок университеті|2 курс|+77010000001|student"
absent "dump-та құпия сөз де, хэш те жоқ" "$(dump)" "fixture-pass-1\|password_hash\|scrypt"
expect "сол email-мен қайта тіркелу → 409" "$(api /api/auth/register "$REG")" "409"

echo "3. Беттер"
expect "/me беті → 200" "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$B/me?welcome=1")" "200"
me=$(curl -s -b "$JAR" "$B/api/auth/me")
expect "/api/auth/me: аты, оқу орны, курс, жасырылған email/телефон" "$(printf '%s' "$me" | py 'p=d["profile"]; print(d["name"], "|", p["university"], "|", p["course"], "|", p["emailMasked"], "|", p["phoneMasked"])')" "Серіков Айдос | Мок университеті | 2 курс | s1•••@mock.test | ••• ••• 00 01"
absent "/api/auth/me толық email/телефонды бермейді" "$me" "s1@mock.test\|77010000001"
expect "/contest cookie-сіз → /login-ға" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/contest" | sed 's#http://[^/]*##')" "307 /login?next=/contest"
expect "/login кірген студентті /contest-ке жібереді" "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code} %{redirect_url}' "$B/login" | sed 's#http://[^/]*##')" "307 /contest"
expect "жалған cookie → /login-ға" "$(curl -s -H 'Cookie: debug_session=eyJzaWQiOiJ4In0.AAAA' -o /dev/null -w '%{http_code} %{redirect_url}' "$B/contest" | sed 's#http://[^/]*##')" "307 /login?next=/contest"
contains "/login?tab=register тіркелу формасын ашады" "$(curl -s "$B/login?tab=register")" "Оқу орны"

echo "4. Шығу және кіру"
curl -s -b "$JAR" -D "$TMP/head" -o /dev/null -X POST "$B/api/auth/logout"
contains "шығу: cookie өшірілді" "$(grep -i 'set-cookie' "$TMP/head")" "Max-Age=0"
expect "бос өрістер → 400" "$(api /api/auth/login '{}')" "400"
expect "қате құпия сөз → 401" "$(api /api/auth/login '{"email":"s1@mock.test","password":"wrong-pass"}')" "401"
contains "түсінікті қазақша хабар" "$(body)" "Email немесе құпия сөз қате"
expect "тіркелмеген email → да 401 (бар-жоғы ашылмайды)" "$(api /api/auth/login '{"email":"nobody@mock.test","password":"wrong-pass"}')" "401"
expect "дұрыс құпия сөз (регистр, бос орын) → 200" "$(api /api/auth/login '{"email":"  S1@MOCK.test ","password":"fixture-pass-1"}')" "200"
contains "кіргенде де cookie беріледі" "$(cat "$TMP/head")" "debug_session="
expect "users кестесінде бір жол (қайталанбады)" "$(dump | py 'print(len(d["users"]))')" "1"
curl -s -o /dev/null -X POST "$B/api/admin/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@mock.test","password":"admin-pass-123"}'
expect "әкімші аккаунты студент ретінде → 403" "$(api /api/auth/login '{"email":"admin@mock.test","password":"admin-pass-123"}')" "403"
contains "әкімшіге түсінікті хабар" "$(body)" "студент ретінде тіркелмеген"

echo "5. Құпия сөзді қалпына келтіру"
expect "тіркелмеген email → 200 (айырмашылық жоқ)" "$(api /api/auth/forgot '{"email":"nobody@mock.test"}')$(body)" '200{"ok":true,"sent":true}'
expect "тіркелген email → 200 (дәл сол жауап)" "$(api /api/auth/forgot '{"email":"s1@mock.test"}')$(body)" '200{"ok":true,"sent":true}'
expect "тіркелмеген email-ге хат кетпеді" "$(curl -s "$B/api/test-hooks/outbox" | py 'print(sum(1 for m in d if m["to"]=="nobody@mock.test"))')" "0"
link=$(last_link s1@mock.test)
contains "сілтеме /auth/reset?token_hash=…" "$link" "/auth/reset?token_hash="
th=$(printf '%s' "$link" | sed 's/.*token_hash=\([^&]*\).*/\1/')
absent "дерекқорда токеннің өзі емес, хэші сақталды" "$(dump | py 'print(d["reset_tokens"])')" "$th"
page=$(curl -s -w "\n%{http_code}" "$B/auth/reset?token_hash=$th&type=recovery")
expect "/auth/reset беті ашылады" "$(printf '%s' "$page" | tail -1)" "200"
contains "жаңа құпия сөз формасы" "$page" "Жаңа құпия сөз"
expect "қысқа құпия сөз → 400 (токенге дейін тексеріледі)" "$(api /api/auth/reset "{\"tokenHash\":\"$th\",\"password\":\"short\"}")" "400"
expect "бұрынғымен бірдей құпия сөз → 400" "$(api /api/auth/reset "{\"tokenHash\":\"$th\",\"password\":\"fixture-pass-1\"}")" "400"
api /api/auth/forgot '{"email":"s1@mock.test"}' > /dev/null
th=$(last_link s1@mock.test | sed 's/.*token_hash=\([^&]*\).*/\1/')
code=$(api /api/auth/reset "{\"tokenHash\":\"$th\",\"password\":\"new-fixture-pass\"}")
expect "жаңа құпия сөз → 200, бірден кіреді" "$code $(body | py 'print(d.get("loggedIn"))')" "200 True"
contains "қалпына келтіргенде cookie беріледі" "$(cat "$TMP/head")" "debug_session="
expect "сол сілтеме қайта → 400" "$(api /api/auth/reset "{\"tokenHash\":\"$th\",\"password\":\"another-pass-1\"}")" "400"
expect "ескі құпия сөз енді өтпейді → 401" "$(api /api/auth/login '{"email":"s1@mock.test","password":"fixture-pass-1"}')" "401"
expect "жаңа құпия сөз өтеді → 200" "$(api /api/auth/login '{"email":"s1@mock.test","password":"new-fixture-pass"}')" "200"

echo "6. Жиілік шегі"
for i in $(seq 1 8); do api /api/auth/login '{"email":"brute@mock.test","password":"nope-nope"}' > /dev/null; done
expect "9-сәтсіз кіру → 429" "$(api /api/auth/login '{"email":"brute@mock.test","password":"nope-nope"}')" "429"
for i in $(seq 1 3); do api /api/auth/forgot '{"email":"spam@mock.test"}' > /dev/null; done
expect "бір email-ге 4-«ұмыттым» → 429" "$(api /api/auth/forgot '{"email":"spam@mock.test"}')" "429"
for i in $(seq 1 5); do api /api/auth/register "${REG/S1@Mock.Test/flood@mock.test}" > /dev/null; done
expect "бір email-мен 6-тіркелу → 429" "$(api /api/auth/register "${REG/S1@Mock.Test/flood@mock.test}")" "429"

echo "7. Логтарда құпия сөз жоқ"
for p in fixture-pass-1 new-fixture-pass wrong-pass nope-nope admin-pass-123; do
  absent "сервер логында '$p' жоқ" "$(cat "$TMP/app.log")" "$p"
done

echo
echo "Нәтиже: $PASS өтті, $FAIL құлады"
[ "$FAIL" -eq 0 ]
