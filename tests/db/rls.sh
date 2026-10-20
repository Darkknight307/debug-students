#!/usr/bin/env bash
# SQL файлдарын жергілікті уақытша Postgres-те ретімен орындап, RLS-ті тексереді.
# Нақты Supabase-ке қосылмайды. Керегі: initdb, pg_ctl, psql (мысалы brew install postgresql).
# Іске қосу: bash tests/db/rls.sh
set -u
cd "$(dirname "$0")/../.."
# Postgres сервері macOS-та жарамды локальсыз іске қоспайды
export LC_ALL=C PGCLIENTENCODING=UTF8
command -v initdb >/dev/null || { echo "initdb жоқ — тест өткізіліп жіберілді"; exit 0; }
TMP="$(mktemp -d)"; PORT="${PGTEST_PORT:-55439}"; PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1 — $2"; }
expect() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "күтілгені [$3], келгені [$2]"; fi; }
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1; rm -rf "$TMP"; }
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres -A trust -E UTF8 --locale=C >/dev/null || exit 1
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/pg.log" -w start >/dev/null || { cat "$TMP/pg.log"; exit 1; }
PSQL=(psql -X -q -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)

echo "1. SQL файлдары ретімен"
for f in tests/db/supabase-stub.sql supabase/001_schema.sql supabase/002_students.sql supabase/003_stages.sql supabase/007_activity.sql supabase/005_october_tasks.sql; do
  if "${PSQL[@]}" -f "$f" > "$TMP/out" 2>&1; then ok "$f"; else bad "$f" "$(tail -3 "$TMP/out")"; fi
done
q() { "${PSQL[@]}" -A -t -c "$1" 2>&1; }
expect "005 жарысты өзі құрды (жарияланды)" "$(q "select status || ' ' || title from contests")" "published DEBUG · Студенттер"
expect "005: 16 тапсырма (10 + 4 + 2)" "$(q "select string_agg(kind || ':' || n, ' ' order by kind) from (select r.kind, count(*) n from tasks t join rounds r on r.id = t.round_id group by r.kind) x")" "code:2 debug:4 mcq:10"
expect "басталуы 15:00 Қазақстан уақыты" "$(q "select to_char(starts_at at time zone 'UTC' + interval '5 hours', 'HH24:MI') from contests")" "15:00"
if "${PSQL[@]}" -f supabase/005_october_tasks.sql > "$TMP/out" 2>&1; then bad "005 қайта орындалса тоқтайды" "қатесіз өтті"; else ok "005 қайта орындалса ештеңе өзгертпей тоқтайды"; fi
expect "қайта орындағаннан кейін де 16 тапсырма" "$(q "select count(*) from tasks")" "16"

echo "2. RLS"
"${PSQL[@]}" -A -F' ' -f tests/db/checks.sql > "$TMP/rls" 2>&1 || { bad "checks.sql" "$(tail -5 "$TMP/rls")"; }
section() { awk -v s="$1" '$0 ~ "^--- " {on = ($0 ~ s)} on' "$TMP/rls"; }
stu="$(section 'студент')"; anon="$(section 'anon')"; adm="$(section 'әкімші')"
for t in students contests rounds tasks submissions activity admins; do
  expect "студент '$t' кестесінен ештеңе көрмейді" "$(printf '%s\n' "$stu" | awk -v t="$t" '$1 == t {print $2}')" "0"
done
expect "студент әкімші RPC/жазуларын орындай алмайды" "$(printf '%s\n' "$stu" | grep -E '^(тыйым|ӨТТІ) ' )" "тыйым тыйым тыйым тыйым тыйым тыйым тыйым"
expect "студент students жолын өзгерте алмайды (0 жол)" "$(printf '%s\n' "$stu" | awk '$1=="updated"{print $2}')" "0"
expect "anon students/tasks көрмейді" "$(printf '%s\n' "$anon" | awk '$1=="students"||$1=="tasks"{printf "%s;", $2}')" "0;0;"
expect "anon расталмағандар санын ала алмайды" "$(printf '%s\n' "$anon" | grep -E '^(тыйым|ӨТТІ)$')" "тыйым"
expect "әкімші студенттер мен тапсырмаларды көреді, расталмаған = 1" "$(printf '%s\n' "$adm" | grep -E '^[0-9]+ [0-9]+ [0-9]+$')" "1 16 1"

echo
echo "Нәтиже: $PASS өтті, $FAIL құлады"
[ "$FAIL" -eq 0 ]
