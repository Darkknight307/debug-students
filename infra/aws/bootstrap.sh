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

# Сервер образы (AMI) бекітіледі: SSM-тегі «latest» AL2023 жаңарғанда CloudFormation инстансты жаңасымен ауыстырар еді.
# Бар стекте — жұмыс істеп тұрған инстанстың AMI-і, жаңа стекте — соңғы AL2023.
AMI="$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:aws:cloudformation:stack-name,Values=$STACK" "Name=tag:aws:cloudformation:logical-id,Values=Instance" \
            "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[0].Instances[0].ImageId' --output text)"
if [ -z "$AMI" ] || [ "$AMI" = "None" ]; then
  AMI="$(aws ssm get-parameter --region "$REGION" --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query Parameter.Value --output text)"
fi

echo "1/4 CloudFormation: $STACK ($REGION), AMI $AMI, OIDC subject $PREFIX — 3–6 минут…"
# Алдымен change set (жоспар): сервер, дерек дискісі не IP ауыстырылатын болса — ештеңе қолданбай тоқтаймыз.
PLAN="$(aws cloudformation deploy --region "$REGION" --stack-name "$STACK" --template-file infra/aws/stack.yml \
  --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset --no-execute-changeset \
  --parameter-overrides "GitHubRepo=$REPO" "GitHubOidcSubjectPrefix=$PREFIX" "AmiId=$AMI")"
CS="$(grep -oE 'arn:aws:cloudformation:[^ ]+:changeSet/[^ ]+' <<<"$PLAN" | head -1 || true)"
if [ -z "$CS" ]; then
  echo "   стек өзгеріссіз"
else
  aws cloudformation describe-change-set --region "$REGION" --change-set-name "$CS" \
    --query 'Changes[].ResourceChange.[Action,LogicalResourceId,Replacement]' --output text | sed 's/^/   /'
  RISKY="$(aws cloudformation describe-change-set --region "$REGION" --change-set-name "$CS" \
    --query "Changes[?ResourceChange.Action=='Modify' && ResourceChange.Replacement!='False'].ResourceChange.LogicalResourceId" \
    --output text | tr '\t' '\n' | grep -xE 'Instance|DataVolume|DataVolumeAttachment|ElasticIp|EipAssociation' || true)"
  if [ -n "$RISKY" ]; then
    aws cloudformation delete-change-set --region "$REGION" --change-set-name "$CS"
    echo "✗ Бұл жаңарту мыналарды ауыстырар еді: $(echo $RISKY) — тоқтатылды, стек өзгерген жоқ." >&2
    exit 1
  fi
  STATUS="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text)"
  aws cloudformation execute-change-set --region "$REGION" --change-set-name "$CS"
  WAIT=stack-update-complete
  [ "$STATUS" = "REVIEW_IN_PROGRESS" ] && WAIT=stack-create-complete
  if ! aws cloudformation wait "$WAIT" --region "$REGION" --stack-name "$STACK"; then
    aws cloudformation describe-stack-events --region "$REGION" --stack-name "$STACK" --max-items 60 \
      --query 'StackEvents[?contains(ResourceStatus, `FAILED`)].[LogicalResourceId,ResourceStatusReason]' --output text >&2
    exit 1
  fi
fi
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
