#!/usr/bin/env bash
# EC2-ге деплой (#57, #68): compose.prod.yml мен Caddyfile-ды серверге жазады, ECR-ден бейнені тартып қайта қосады,
# сосын https://…/api/health осы нұсқаны (git SHA) көрсеткенше күтеді (5 мин).
#   INSTANCE_ID=… AWS_REGION=… SITE_URL=https://….sslip.io bash infra/aws/deploy.sh <ecr-image-uri> [version]
set -euo pipefail
IMAGE="${1:?ECR бейнесінің URI-і керек}"
VERSION="${2:-}"
: "${INSTANCE_ID:?}" "${AWS_REGION:?}" "${SITE_URL:?}"
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=infra/aws/ssm.sh
. "$DIR/ssm.sh"

COMPOSE_B64=$(base64 < "$DIR/compose.prod.yml" | tr -d '\n')
CADDY_B64=$(base64 < "$DIR/Caddyfile" | tr -d '\n')
ssm_run "set -euo pipefail
cd /opt/debug
echo '$COMPOSE_B64' | base64 -d > compose.yml
echo '$CADDY_B64' | base64 -d > Caddyfile
/usr/local/bin/debug-deploy '$IMAGE'
docker compose ps --format '{{.Service}} {{.Status}}'" "deploy ${VERSION:-manual}"

echo "health: $SITE_URL/api/health"
body=""
for _ in $(seq 1 60); do
  body=$(curl -fsS --max-time 5 "$SITE_URL/api/health" 2>/dev/null || true)
  if printf '%s' "$body" | grep -q '"db":"up"' && { [ -z "$VERSION" ] || printf '%s' "$body" | grep -q "\"version\":\"$VERSION\""; }; then
    echo "✓ $body"
    exit 0
  fi
  sleep 5
done
echo "✗ health check failed: ${body:-no answer}" >&2
exit 1
