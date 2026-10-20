#!/usr/bin/env bash
# Тіркелу мен кірудің толық ағыны: Next.js сервері + мок Supabase Auth/REST.
# Іске қосу: bash tests/auth/e2e.sh
set -u
cd "$(dirname "$0")/../.."
MOCK_PORT=4455
APP_PORT=3100
B="http://127.0.0.1:$APP_PORT"
M="http://127.0.0.1:$MOCK_PORT"
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
cfg() { curl -s -X POST "$M/__config" -d "$1" > /dev/null; }
dbg() { curl -s "$M/__debug"; }
py() { python3 -I -c "import json,sys; d=json.load(sys.stdin); $1"; }
last_link() { dbg | py "print([m['link'] for m in d['mails'] if m['to']=='$1' and m['kind']=='$2'][-1])"; }
REG='{"lastName":"  Серіков ","firstName":"Айдос","university":"Мок университеті","course":"2 курс","phone":"8 701 000 00 01","email":"S1@Mock.Test","password":"fixture-pass-1"}'

cleanup() { kill "$MOCK_PID" "$APP_PID" 2>/dev/null; pkill -f "next dev -p $APP_PORT" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

MOCK_SITE="$B" node tests/auth/mock-server.mjs > "$TMP/mock.log" 2>&1 & MOCK_PID=$!
NEXT_PUBLIC_SUPABASE_URL="$M" NEXT_PUBLIC_SUPABASE_ANON_KEY="test-anon" SUPABASE_SERVICE_ROLE_KEY="test-service-role" \
  SUPABASE_SECRET_KEY="sb_secret_test" NEXT_PUBLIC_SITE_URL="$B" AUTH_EMAILS_ENABLED=1 \
  SESSION_SECRET="e2e-secret-e2e-secret-e2e-secret-000" NEXT_DIST_DIR="node_modules/.cache/next-e2e-auth" \
  npx next dev -p "$APP_PORT" > "$TMP/app.log" 2>&1 & APP_PID=$!

echo "Next.js іске қосылуда…"
for i in $(seq 1 120); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$B/login" || true)
  [ "$code" = "200" ] && break
  sleep 1
done

echo "1. Тіркелу өрістерін тексеру"
expect "JSON емес сұраныс → 415" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/auth/register" -H 'Content-Type: text/plain' -d x)" "415"
expect "бос форма → 400 (тегі)" "$(api /api/auth/register '{}')$(body | py 'print(d["field"])')" "400lastName"
expect "email дұрыс емес → 400" "$(api /api/auth/register "${REG/S1@Mock.Test/not-an-email}")$(body | py 'print(d["field"])')" "400email"
expect "құпия сөз 8 таңбадан қысқа → 400" "$(api /api/auth/register "${REG/fixture-pass-1/short}")$(body | py 'print(d["field"])')" "400password"
expect "курс тізімде жоқ → 400" "$(api /api/auth/register "${REG/2 курс/7 курс}")$(body | py 'print(d["field"])')" "400course"
expect "телефон дұрыс емес → 400" "$(api /api/auth/register "${REG/8 701 000 00 01/12345}")$(body | py 'print(d["field"])')" "400phone"
expect "атында цифр → 400" "$(api /api/auth/register "${REG/Айдос/Айдос2}")$(body | py 'print(d["field"])')" "400firstName"
expect "бірде-бір қате сұраныс Supabase-ке жетпеді" "$(dbg | py 'print(len(d["users"]))')" "1"

echo "2. Тіркелу (email растау өшірулі) → бірден кіреді"
code=$(api /api/auth/register "$REG" -c "$JAR")
expect "тіркелу → 200, loggedIn" "$code $(body | py 'print(d.get("loggedIn"))')" "200 True"
contains "debug_session cookie берілді" "$(cat "$TMP/head")" "debug_session="
contains "cookie HttpOnly" "$(grep -i 'set-cookie' "$TMP/head")" "HttpOnly"
row=$(dbg | py 'r=[x for x in d["rows"] if x["email"]=="s1@mock.test"][0]; print("|".join([r["full_name"], r["last_name"], r["first_name"], r["university"], r["course"], r["phone"]]))')
expect "students жолы: «Тегі Аты», тазаланған, телефон +7…" "$row" "Серіков Айдос|Серіков|Айдос|Мок университеті|2 курс|+77010000001"
expect "email кіші әріппен сақталды" "$(dbg | py 'print(d["users"][-1]["email"])')" "s1@mock.test"
expect "профиль auth метадеректеріне де жазылды" "$(dbg | py 'print(d["users"][-1]["meta"]["university"])')" "Мок университеті"
for f in password token access_token; do
  absent "students-ке '$f' жіберілмеді" "$(dbg | py 'print(d["received"])')" "'$f'"
done
expect "Supabase-ке secret кілт барды" "$(dbg | py 'print("sb_secret_test" in d["apikeys"])')" "True"
contains "студенттің IP-і Sb-Forwarded-For арқылы жіберілді" "$(dbg | py 'print(d["forwardedFor"])')" "203.0.113.7"
expect "сол email-мен қайта тіркелу → 409" "$(api /api/auth/register "$REG")" "409"

echo "3. Беттер"
page=$(curl -s -b "$JAR" -w "\n%{http_code}" "$B/me?welcome=1")
expect "/me cookie-мен → 200" "$(printf '%s' "$page" | tail -1)" "200"
contains "/me аты-жөнін көрсетеді" "$page" "Серіков Айдос"
contains "/me оқу орнын көрсетеді" "$page" "Мок университеті"
contains "/me курсты көрсетеді" "$page" "2 курс"
contains "/me қарсы алады" "$page" "тіркелдіңіз"
absent "/me телефонды толық көрсетпейді" "$page" "+77010000001"
absent "/me email-ді толық көрсетпейді" "$page" "s1@mock.test"
expect "/me cookie-сіз → /login-ға" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/me" | sed 's#http://[^/]*##')" "307 /login"
expect "/login кірген студентті /contest-ке жібереді" "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code} %{redirect_url}' "$B/login" | sed 's#http://[^/]*##')" "307 /contest"
expect "жалған cookie → /login-ға" "$(curl -s -H 'Cookie: debug_session=eyJzaWQiOiJ4In0.AAAA' -o /dev/null -w '%{http_code} %{redirect_url}' "$B/me" | sed 's#http://[^/]*##')" "307 /login"
contains "/login?tab=register тіркелу формасын ашады" "$(curl -s "$B/login?tab=register")" "Оқу орны"
expect "/api/auth/me кірген студент" "$(curl -s -b "$JAR" "$B/api/auth/me" | py 'print(d)')" "{'loggedIn': True, 'name': 'Серіков Айдос'}"

echo "4. Шығу және кіру"
curl -s -b "$JAR" -D "$TMP/head" -o /dev/null -X POST "$B/api/auth/logout"
contains "шығу: cookie өшірілді" "$(grep -i 'set-cookie' "$TMP/head")" "Max-Age=0"
expect "бос өрістер → 400" "$(api /api/auth/login '{}')" "400"
expect "қате құпия сөз → 401" "$(api /api/auth/login '{"email":"s1@mock.test","password":"wrong-pass"}')" "401"
contains "түсінікті қазақша хабар" "$(body)" "Email немесе құпия сөз қате"
expect "дұрыс құпия сөз → 200" "$(api /api/auth/login '{"email":"  S1@MOCK.test ","password":"fixture-pass-1"}')" "200"
contains "кіргенде де cookie беріледі" "$(cat "$TMP/head")" "debug_session="
expect "студенттер кестесінде бір жол (қайталанбады)" "$(dbg | py 'print(len(d["rows"]))')" "1"
expect "студент профилі жоқ аккаунт (әкімші) → 403" "$(api /api/auth/login '{"email":"admin@mock.test","password":"admin-pass-123"}')" "403"
contains "әкімшіге түсінікті хабар" "$(body)" "студент ретінде тіркелмеген"

echo "5. Email растау қосулы"
cfg '{"confirm":true}'
REG2='{"lastName":"Қайрат","firstName":"Бота","university":"Мок колледжі","course":"1 курс","phone":"","email":"s2@mock.test","password":"fixture-pass-2"}'
code=$(api /api/auth/register "$REG2")
expect "тіркелу → 200, needsConfirm, cookie жоқ" "$code $(body | py 'print(d.get("needsConfirm"))') $(grep -ci 'set-cookie' "$TMP/head")" "200 True 0"
expect "расталмаған студент тізімге кірмеді" "$(dbg | py 'print(len(d["rows"]))')" "1"
link=$(last_link s2@mock.test signup)
contains "растау сілтемесі /auth/confirm?token_hash=…&type=email" "$link" "/auth/confirm?token_hash="
expect "бұрын тіркелген email → дәл сондай жауап (email бар-жоғы ашылмайды)" "$(api /api/auth/register "$REG")$(body | py 'print(d.get("needsConfirm"))')" "200True"
expect "расталмай кіру → 403 unconfirmed" "$(api /api/auth/login '{"email":"s2@mock.test","password":"fixture-pass-2"}') $(body | py 'print(d.get("unconfirmed"))')" "403 True"
expect "хатты қайта жіберу → 200" "$(api /api/auth/resend '{"email":"s2@mock.test"}')" "200"
expect "тіркелмеген email-ге қайта жіберу де → 200" "$(api /api/auth/resend '{"email":"nobody@mock.test"}')" "200"
link=$(last_link s2@mock.test signup)
path=${link#$B}
code=$(curl -s -c "$JAR" -o /dev/null -D "$TMP/head" -w '%{http_code} %{redirect_url}' "$B$path" | sed 's#http://[^/]*##')
expect "растау сілтемесі → 303 /me?welcome=1" "$code" "303 /me?welcome=1"
contains "растағанда cookie беріледі" "$(cat "$TMP/head")" "debug_session="
expect "енді студент тізімде (2 жол), телефон бос" "$(dbg | py 'r=[x for x in d["rows"] if x["email"]=="s2@mock.test"]; print(len(d["rows"]), r[0]["phone"])')" "2 None"
expect "сілтемені қайта ашу → /login?confirm=expired" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B$path" | sed 's#http://[^/]*##')" "303 /login?confirm=expired"
contains "/login түсіндіреді" "$(curl -s "$B/login?confirm=expired")" "мерзімі өткен"
expect "растағаннан кейін кіру → 200" "$(api /api/auth/login '{"email":"s2@mock.test","password":"fixture-pass-2"}')" "200"
cfg '{"confirm":false}'

echo "6. Құпия сөзді қалпына келтіру"
expect "тіркелмеген email → 200 (айырмашылық жоқ)" "$(api /api/auth/forgot '{"email":"nobody@mock.test"}')$(body)" '200{"ok":true,"sent":true}'
expect "тіркелген email → 200 (дәл сол жауап)" "$(api /api/auth/forgot '{"email":"s1@mock.test"}')$(body)" '200{"ok":true,"sent":true}'
link=$(last_link s1@mock.test recovery)
contains "сілтеме /auth/reset?token_hash=…" "$link" "/auth/reset?token_hash="
th=$(printf '%s' "$link" | sed 's/.*token_hash=\([^&]*\).*/\1/')
page=$(curl -s -w "\n%{http_code}" "$B/auth/reset?token_hash=$th&type=recovery")
expect "/auth/reset беті ашылады" "$(printf '%s' "$page" | tail -1)" "200"
contains "жаңа құпия сөз формасы" "$page" "Жаңа құпия сөз"
expect "қысқа құпия сөз → 400 (токенге дейін тексеріледі)" "$(api /api/auth/reset "{\"tokenHash\":\"$th\",\"password\":\"short\"}")" "400"
expect "бұрынғымен бірдей құпия сөз → 400" "$(api /api/auth/reset "{\"tokenHash\":\"$th\",\"password\":\"fixture-pass-1\"}")" "400"
th=$(printf '%s' "$(api /api/auth/forgot '{"email":"s1@mock.test"}' >/dev/null; last_link s1@mock.test recovery)" | sed 's/.*token_hash=\([^&]*\).*/\1/')
code=$(api /api/auth/reset "{\"tokenHash\":\"$th\",\"password\":\"new-fixture-pass\"}")
expect "жаңа құпия сөз → 200, бірден кіреді" "$code $(body | py 'print(d.get("loggedIn"))')" "200 True"
contains "қалпына келтіргенде cookie беріледі" "$(cat "$TMP/head")" "debug_session="
expect "сол сілтеме қайта → 400" "$(api /api/auth/reset "{\"tokenHash\":\"$th\",\"password\":\"another-pass-1\"}")" "400"
expect "ескі құпия сөз енді өтпейді → 401" "$(api /api/auth/login '{"email":"s1@mock.test","password":"fixture-pass-1"}')" "401"
expect "жаңа құпия сөз өтеді → 200" "$(api /api/auth/login '{"email":"s1@mock.test","password":"new-fixture-pass"}')" "200"

echo "7. Дерекқор уақытша қолжетімсіз"
cfg '{"dbDown":true}'
expect "логин дұрыс, дерекқор жоқ → 503" "$(api /api/auth/login '{"email":"s2@mock.test","password":"fixture-pass-2"}')" "503"
contains "себебі ашық айтылады" "$(body)" "дерекқоры уақытша қолжетімсіз"
cfg '{"dbDown":false}'

echo "8. Жиілік шегі"
for i in $(seq 1 8); do api /api/auth/login '{"email":"brute@mock.test","password":"nope-nope"}' > /dev/null; done
expect "9-сәтсіз кіру → 429" "$(api /api/auth/login '{"email":"brute@mock.test","password":"nope-nope"}')" "429"
for i in $(seq 1 3); do api /api/auth/forgot '{"email":"spam@mock.test"}' > /dev/null; done
expect "бір email-ге 4-«ұмыттым» → 429" "$(api /api/auth/forgot '{"email":"spam@mock.test"}')" "429"
for i in $(seq 1 5); do api /api/auth/register "${REG/S1@Mock.Test/flood@mock.test}" > /dev/null; done
expect "бір email-мен 6-тіркелу → 429" "$(api /api/auth/register "${REG/S1@Mock.Test/flood@mock.test}")" "429"

echo "9. Логтарда құпия сөз жоқ"
for p in fixture-pass-1 fixture-pass-2 new-fixture-pass wrong-pass nope-nope admin-pass-123; do
  absent "сервер логында '$p' жоқ" "$(cat "$TMP/app.log")" "$p"
done

echo
echo "Нәтиже: $PASS өтті, $FAIL құлады"
[ "$FAIL" -eq 0 ]
