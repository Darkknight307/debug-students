#!/usr/bin/env bash
# AWS-ті бір командамен баптау (#68): CloudFormation стегі → CI айнымалылары → CI деплойы → (қаласа) дерек импорты.
#   AWS_PROFILE=debug bash infra/aws/bootstrap.sh [data-export.json]
# Иесі өз терминалында іске қосады — стек құру және репо айнымалыларын қою оның аккаунттарындағы әрекет.
set -euo pipefail
cd "$(dirname "$0")/../.."
STACK="${STACK:-debug-students}"
REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || true)}"
REGION="${REGION:-eu-central-1}"

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
# GitHub OIDC токенінің sub префиксі (immutable subject қосулы репода иелер/репо ID-лері де бар)
PREFIX="$(gh api "repos/$REPO/actions/oidc/customization/sub" --jq '.sub_claim_prefix // empty' 2>/dev/null || true)"
PREFIX="${PREFIX:-repo:$REPO}"

echo "1/4 CloudFormation: $STACK ($REGION), OIDC subject $PREFIX — 3–6 минут…"
aws cloudformation deploy --region "$REGION" --stack-name "$STACK" --template-file infra/aws/stack.yml \
  --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "GitHubRepo=$REPO" "GitHubOidcSubjectPrefix=$PREFIX"
out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
SITE_URL="$(out SiteUrl)"
INSTANCE_ID="$(out InstanceId)"

echo "2/4 GitHub репо айнымалылары (құпия емес)…"
gh variable set AWS_REGION --body "$REGION"
gh variable set AWS_DEPLOY_ROLE_ARN --body "$(out DeployRoleArn)"
gh variable set ECR_REPOSITORY_URI --body "$(out EcrRepositoryUri)"
gh variable set EC2_INSTANCE_ID --body "$INSTANCE_ID"
gh variable set SITE_URL --body "$SITE_URL"

echo "3/4 CI деплойы (main-дегі соңғы іске қосу)…"
RUN="$(gh run list --workflow ci.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
SHA="$(gh run view "$RUN" --json headSha --jq .headSha)"
gh run watch "$RUN" > /dev/null 2>&1 || true
if ! curl -fsS --max-time 5 "$SITE_URL/api/health" 2>/dev/null | grep -q "\"version\":\"$SHA\""; then
  JOB="$(gh run view "$RUN" --json jobs --jq '.jobs[] | select(.name | startswith("Deploy")) | .databaseId')"
  gh run rerun --job "$JOB"
  sleep 20
  if ! gh run watch "$RUN" --exit-status > /dev/null; then
    echo "✗ CI деплойы сәтсіз: gh run view $RUN --log-failed" >&2
    exit 1
  fi
fi
curl -fsS "$SITE_URL/api/health"
echo

if [ -n "${1:-}" ]; then
  echo "4/4 деректі көшіру…"
  INSTANCE_ID="$INSTANCE_ID" AWS_REGION="$REGION" bash infra/aws/import-data.sh "$1"
fi
echo "✓ $SITE_URL"
