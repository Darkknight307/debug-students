#!/usr/bin/env bash
# AWS-ті бір командамен баптау/жаңарту (#68, #86–#91): CloudFormation стегі → CI айнымалылары → (қаласа) дерек импорты.
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
gh variable set DEV_SITE_URL --body "$(out DevSiteUrl)"
gh variable set AWS_ONCALL_ROLE_ARN --body "$(out OnCallRoleArn)"
gh label create incident --color B60205 --description "Production alert handled by the on-call agent" --force > /dev/null

echo "3/4 Жеткізу: әр push → development (CI, #86); production → «Promote to production» (gh workflow run promote.yml, #87)"
curl -fsS --max-time 10 "$SITE_URL/api/health" || true
echo

if [ -n "${1:-}" ]; then
  echo "4/4 деректі көшіру…"
  INSTANCE_ID="$INSTANCE_ID" AWS_REGION="$REGION" bash infra/aws/import-data.sh "$1"
fi
echo "✓ $SITE_URL"
