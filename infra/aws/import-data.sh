#!/usr/bin/env bash
# Деректі AWS-тегі Postgres-ке көшіру (#66, #68). Дерекқор порты ашылмайды: JSON экспорт gzip+base64 бөліктерімен SSM
# арқылы серверге жетеді, app контейнері ішінде импортталады (бос дерекқорға ғана), файл бірден өшіріледі.
#   npm run db:import -- --from <libsql://… | postgresql://… экспорт көзі> --export data-export.json
#   INSTANCE_ID=… AWS_REGION=… bash infra/aws/import-data.sh data-export.json
set -euo pipefail
FILE="${1:?data-export.json керек}"
: "${INSTANCE_ID:?}" "${AWS_REGION:?}"
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=infra/aws/ssm.sh
. "$DIR/ssm.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
gzip -c "$FILE" | base64 | tr -d '\n' > "$TMP/data.b64"
split -b 30000 "$TMP/data.b64" "$TMP/part."
ssm_run "rm -f /opt/debug/import.b64 /opt/debug/import.json" "import: clean"
n=0
for p in "$TMP"/part.*; do
  n=$((n + 1))
  ssm_run "umask 077; printf %s '$(cat "$p")' >> /opt/debug/import.b64" "import: part $n" > /dev/null
done
ssm_run "set -uo pipefail
cd /opt/debug
umask 077
base64 -d import.b64 | gunzip > import.json && rm -f import.b64
chown 1000:1000 import.json  # контейнерде импорт root емес node (uid 1000) атынан жүреді; файл бәрібір 600
docker compose run --rm --no-deps -v /opt/debug/import.json:/tmp/import.json:ro app node /app/prisma/import-data.mjs --from /tmp/import.json
code=\$?
rm -f import.json
exit \$code" "import: run"
