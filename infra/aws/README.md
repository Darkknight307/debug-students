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

Not used on purpose (would cost money): NAT gateway, load balancer, RDS, CloudWatch detailed monitoring, extra IPs.
Never upgrade the account to a paid plan for this project.

## Prerequisites (owner)

1. AWS account on the **Free plan** (sign-up asks for a card; do not upgrade).
2. AWS CLI v2 (`brew install awscli`) and credentials of an IAM user with admin rights:
   `aws configure` (region `eu-central-1`). The agent never types credentials.
3. GitHub CLI logged in (`gh auth status`).

## Create the stack

```bash
aws cloudformation deploy \
  --stack-name debug-students \
  --template-file infra/aws/stack.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides AlertEmail=you@example.com
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
