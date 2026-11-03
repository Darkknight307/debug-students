# SSM Run Command көмекшісі (deploy.sh, import-data.sh): серверде bash командасын орындап, нәтижесін күтеді.
# Керек: INSTANCE_ID, AWS_REGION; AWS CLI тіркелгісі (CI-да OIDC рөлі, қолмен — aws configure).
ssm_run() {
  local script="$1" comment="${2:-debug}" id status
  id=$(aws ssm send-command --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript \
    --comment "$comment" --timeout-seconds 600 \
    --parameters "$(node -e 'console.log(JSON.stringify({ commands: [process.argv[1]], executionTimeout: ["900"] }))' "$script")" \
    --query Command.CommandId --output text)
  status=Pending
  for _ in $(seq 1 200); do
    status=$(aws ssm get-command-invocation --region "$AWS_REGION" --command-id "$id" --instance-id "$INSTANCE_ID" \
      --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Pending | InProgress | Delayed) sleep 5 ;; *) break ;; esac
  done
  inv() { aws ssm get-command-invocation --region "$AWS_REGION" --command-id "$id" --instance-id "$INSTANCE_ID" --query "$1" --output text; }
  inv StandardOutputContent | tail -n 40
  if [ "$status" != "Success" ]; then
    inv StandardErrorContent | tail -n 40 >&2
    echo "SSM $comment: $status (command $id)" >&2
    return 1
  fi
}
