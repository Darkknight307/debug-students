# AWS production (#68)

One CloudFormation stack, free account only: an EC2 `t3.micro` runs Docker Compose —
**Caddy** (HTTPS, Let's Encrypt) → **app** (the same image as `Dockerfile`, from ECR) → **PostgreSQL** (data on its own
encrypted EBS volume). GitHub Actions deploys every push to `main` through **OIDC** (no AWS keys in GitHub) and **SSM
Run Command** (no SSH, port 22 is closed).

```
Internet ──443/80──► EC2 t3.micro (Amazon Linux 2023, Elastic IP, <ip>.sslip.io)
                      ├─ caddy:2-alpine   TLS, http→https, reverse proxy
                      ├─ app (ECR)        Next.js standalone: static frontend + API, migrations on start
                      └─ postgres:17      /data/postgres on a separate 10 GB gp3 volume (no public port)
GitHub Actions ──OIDC──► DeployRole ──► ECR push + ssm:SendCommand(AWS-RunShellScript, this instance only)
```

## What it costs

Everything is chosen to stay inside the free account / credits:

| Resource | Size | Why it stays free |
|---|---|---|
| EC2 | `t3.micro`, `CPUCredits: standard` | free-tier eligible; *standard* credits never bill extra CPU (T3 *unlimited* can) |
| EBS | 10 GB root + 10 GB data, gp3 | ≤ 30 GB free-tier storage |
| Elastic IP | 1, attached | public IPv4 is billed per hour (~$3.6/month); the free tier's 750 h/month or the sign-up credits cover one address — delete the stack when it is not needed |
| ECR | ≤ 5 images (lifecycle rule) | ~0.2 GB each, inside the free 500 MB |
| SSM, IAM, OIDC, VPC, security group | — | free |
| AWS Budget (optional `AlertEmail`) | 1 budget | the first two budgets are free |

| CloudWatch metrics / alarms / dashboards | 10 metric streams (5 × `env`), 7 alarm metrics, 1 dashboard | always-free tier: 10 metrics, 10 alarms, 3 dashboards |
| CloudWatch Logs | `/debug-students/app`, `/debug-students/metrics`, Lambda — 7-day retention | 5 GB ingestion + storage free |
| X-Ray | 20 % of production traces + every 5xx; health/static never | 100 000 traces/month free |
| SNS + Lambda (alert relay) | a few invocations per alarm | 1 M requests free |
| SSM Parameter Store | 1 standard SecureString (GitHub token) | free |

Not used on purpose (would cost money): NAT gateway, load balancer, RDS, CloudWatch detailed monitoring, extra IPs.
Never upgrade the account to a paid plan for this project.

## Prerequisites (owner)

1. AWS account on the **Free plan** (sign-up asks for a card; do not upgrade).
2. AWS CLI v2 (`brew install awscli`) and credentials of an IAM user with admin rights:
   `aws configure` (region `eu-central-1`). The agent never types credentials.
3. GitHub CLI logged in (`gh auth status`).

## One command

```bash
npm run db:import -- --from "<current production database>" --export data-export.json   # optional: data to copy
AWS_PROFILE=<profile> bash infra/aws/bootstrap.sh data-export.json
```

`bootstrap.sh` creates/updates the stack, sets the repository variables, checks `/api/health`, then imports the data
file. The steps below are the same thing by hand.

The instance AMI is **pinned** (`AmiId`): the script passes the AMI of the running instance (the latest Amazon Linux 2023
only for a new stack), because a moving "latest" value would make CloudFormation replace the server on every update.
The script first creates a change set and stops without applying anything if it would replace `Instance`,
`DataVolume`, `DataVolumeAttachment`, `ElasticIp` or `EipAssociation`.

## Create the stack

```bash
AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text)        # an update: the running instance's ImageId instead
aws cloudformation deploy \
  --stack-name debug-students \
  --template-file infra/aws/stack.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides AmiId=$AMI AlertEmail=you@example.com
aws cloudformation describe-stacks --stack-name debug-students --query "Stacks[0].Outputs" --output table
```

`CreateGitHubOidcProvider=false` if the account already has the GitHub OIDC provider.

Give CI the outputs (repository **variables**, nothing secret):

```bash
out() { aws cloudformation describe-stacks --stack-name debug-students --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
gh variable set AWS_REGION --body eu-central-1
gh variable set AWS_DEPLOY_ROLE_ARN --body "$(out DeployRoleArn)"
gh variable set ECR_REPOSITORY_URI --body "$(out EcrRepositoryUri)"
gh variable set EC2_INSTANCE_ID --body "$(out InstanceId)"
gh variable set SITE_URL --body "$(out SiteUrl)"
```

The next push to `main` (or *Re-run* of the last CI/CD run) builds the `linux/amd64` image, pushes it to ECR, runs
`infra/aws/deploy.sh` over SSM and waits until `SITE_URL/api/health` reports the commit SHA.

## Data

The production data is copied with the import script (#66) — into an **empty** database, right after the first deploy:

```bash
npm run db:import -- --from "<source>" --export data-export.json     # Turso libsql://… (SOURCE_AUTH_TOKEN) or Neon export
INSTANCE_ID=… AWS_REGION=eu-central-1 bash infra/aws/import-data.sh data-export.json
rm data-export.json
```

The file travels in gzip+base64 chunks over SSM, is imported inside the app container and deleted on the server.
The admin account arrives with the data (password hash). Backup:

```bash
aws ssm start-session --target <InstanceId>          # shell without SSH (Session Manager plugin)
sudo docker compose -f /opt/debug/compose.yml exec db pg_dump -U debug debug > backup.sql
```

## Update the server by hand

```bash
INSTANCE_ID=… AWS_REGION=eu-central-1 SITE_URL=https://….sslip.io bash infra/aws/deploy.sh <ecr-uri>:<tag> [<sha>]
```

## Delete everything

```bash
aws cloudformation delete-stack --stack-name debug-students
aws cloudformation wait stack-delete-complete --stack-name debug-students
```

The ECR repository is emptied automatically; the instance, both volumes (with the data), the Elastic IP, the VPC and the
roles are removed. Then delete the GitHub variables (`gh variable delete …`).

## Development, production and promotion (#86, #87)

| | URL | Containers | Database | Deployed by |
|---|---|---|---|---|
| development | `https://dev.<ip>.sslip.io` | `app-dev` | `db-dev` (`/data/postgres-dev`) | every push to `main` (CI job `deploy-dev`) |
| production | `https://<ip>.sslip.io` | `app` | `db` (`/data/postgres`) | **Promote to production** only |

```bash
gh workflow run promote.yml                                 # promote the version that is healthy on development
gh workflow run promote.yml -f sha=<older sha> -f force=true # rollback to an older image
```

Dev secrets are generated on the server at the first dev deploy. A dev deploy never restarts production containers
(`docker compose up --no-deps` of the dev services only).

## Observability (#88, #89, #90)

`app` / `app-dev` → OTLP/HTTP → `otel` (AWS Distro for OpenTelemetry collector, `otel-collector.yaml`) →
X-Ray (traces), CloudWatch Metrics via EMF (namespace `DebugStudents`, dimension `env`) and CloudWatch Logs.
`http_latency` / `http_5xx` cover what Next.js serves dynamically (API routes, server-rendered pages). Static files
are not traced — including the landing and leaderboard HTML (`/` and `/board` are rewrites to `public/*.html`); the API
calls those pages make are counted.
Dashboard: stack output `DashboardUrl`. Alarms (production): `debug-prod-5xx`, `debug-prod-latency`,
`debug-prod-login-failures`, `debug-prod-submissions-anomaly` (anomaly detection), `debug-instance-status` →
SNS topic `debug-students-alerts` (+ e-mail when `AlertEmail` is set).

## AI on-call agent (#91)

alarm → SNS → Lambda `debug-students-alert-relay` → GitHub `repository_dispatch` → `.github/workflows/oncall.yml`
→ Gemini agent (`ops/oncall`) with read-only tools (role `OnCallRole`) → `incident` issue; OK → resolved + closed.

Owner setup (once, secrets never in chat or the repo):

```bash
gh secret set GEMINI_API_KEY                       # key from https://aistudio.google.com/apikey
read -s T && aws ssm put-parameter --profile debug --region eu-central-1 \
  --name /debug-students/github-dispatch-token --type SecureString --value "$T" && unset T
                                                   # fine-grained token: this repository, Contents read/write
gh variable set GEMINI_MODEL --body gemini-flash-latest   # optional, default
```

Drill: `aws cloudwatch set-alarm-state --alarm-name debug-prod-5xx --state-value ALARM --state-reason "drill"`
(full path through SNS and Lambda; CloudWatch returns it to OK at the next evaluation, which closes the issue) or
`gh workflow run oncall.yml -f alarm=debug-prod-5xx -f state=ALARM` (agent only).
