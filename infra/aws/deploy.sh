#!/usr/bin/env bash
# EC2-ге деплой (#57, #68, #86, #87): compose.prod.yml, Caddyfile, otel-collector.yaml серверге жазылады, ECR-ден бейне
# тартылады және ТЕК көрсетілген орта қайта қосылады; сосын сол ортаның /api/health-і осы нұсқаны (git SHA) көрсеткенше
# күтеді (5 мин).
#   INSTANCE_ID=… AWS_REGION=… SITE_URL=https://<ip>.sslip.io bash infra/aws/deploy.sh development|production <ecr-image> [sha]
set -euo pipefail
ENV_NAME="${1:?орта керек: development не production}"
IMAGE="${2:?ECR бейнесінің URI-і керек}"
VERSION="${3:-}"
: "${INSTANCE_ID:?}" "${AWS_REGION:?}" "${SITE_URL:?}"
case "$ENV_NAME" in
  production) SERVICES="db otel app caddy"; VAR=APP_IMAGE; URL="$SITE_URL" ;;
  development) SERVICES="db-dev otel app-dev caddy"; VAR=APP_IMAGE_DEV; URL="${SITE_URL/https:\/\//https://dev.}" ;;
  *) echo "орта: development не production" >&2; exit 2 ;;
esac
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=infra/aws/ssm.sh
. "$DIR/ssm.sh"
b64() { base64 < "$1" | tr -d '\n'; }

ssm_run "set -euo pipefail
cd /opt/debug
echo '$(b64 "$DIR/compose.prod.yml")' | base64 -d > compose.yml
echo '$(b64 "$DIR/otel-collector.yaml")' | base64 -d > otel-collector.yaml
echo '$(b64 "$DIR/Caddyfile")' | base64 -d > Caddyfile.new
# development құпиялары бірінші dev деплойында осы серверде жасалады (репода да, CI-да да жоқ)
umask 077
grep -q '^DEV_SESSION_SECRET=' .env || echo \"DEV_SESSION_SECRET=\$(openssl rand -hex 32)\" >> .env
grep -q '^DEV_POSTGRES_PASSWORD=' .env || echo \"DEV_POSTGRES_PASSWORD=\$(openssl rand -hex 24)\" >> .env
grep -q '^APP_IMAGE_DEV=' .env || echo \"APP_IMAGE_DEV=\$(grep '^APP_IMAGE=' .env | cut -d= -f2)\" >> .env
mkdir -p /data/postgres-dev
REGISTRY=\$(echo '$IMAGE' | cut -d/ -f1)
aws ecr get-login-password --region '$AWS_REGION' | docker login --username AWS --password-stdin \"\$REGISTRY\" > /dev/null
sed -i 's#^$VAR=.*#$VAR=$IMAGE#' .env
docker compose pull ${SERVICES% caddy}
# --no-deps: басқа ортаның контейнеріне тимейміз (dev деплойы production-ды қайта қоспайды)
docker compose up -d --no-deps $SERVICES
if ! cmp -s Caddyfile Caddyfile.new; then mv Caddyfile.new Caddyfile && docker compose restart caddy; else rm -f Caddyfile.new; fi
docker logout \"\$REGISTRY\" > /dev/null
docker image prune -af --filter until=48h > /dev/null || true
docker compose ps --format '{{.Service}} {{.Status}}'" "deploy $ENV_NAME ${VERSION:-manual}"

echo "health: $URL/api/health"
body=""
for _ in $(seq 1 60); do
  body=$(curl -fsS --max-time 5 "$URL/api/health" 2>/dev/null || true)
  if printf '%s' "$body" | grep -q '"db":"up"' && printf '%s' "$body" | grep -q "\"env\":\"$ENV_NAME\"" &&
    { [ -z "$VERSION" ] || printf '%s' "$body" | grep -q "\"version\":\"$VERSION\""; }; then
    echo "✓ $body"
    exit 0
  fi
  sleep 5
done
echo "✗ health check failed: ${body:-no answer}" >&2
exit 1
