# syntax=docker/dockerfile:1.7
# DEBUG · Студенттер — бір бейне, бір Node процесі (#64): статикалық фронтенд (public/: лендинг, лидерборд, шрифттер,
# Pyodide worker; .next/static) + API (Next.js route handlers). Next.js standalone сервері екеуін де өзі береді.
#   docker build --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t debug-students .
# Құпиялар бейнеге кірмейді — тек іске қосқанда env арқылы (SESSION_SECRET, DATABASE_URL, ADMIN_*).

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
# Prisma query/schema engine-дері OpenSSL 3-ке байланған
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1 PRISMA_HIDE_UPDATE_MESSAGE=1 CHECKPOINT_DISABLE=1
WORKDIR /app

# 1. Тәуелділіктер — package*.json мен схема өзгермесе, қабат кэштен алынады
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma/schema.prisma prisma/schema.prisma
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# 2. Құрастыру: Prisma клиенті → Next.js standalone (rhel engine тек Vercel-ге керек) → бір файлға жиналған seed → Prisma CLI
FROM deps AS build
COPY . .
ENV NEXT_OUTPUT=standalone
RUN npx prisma generate && npx next build \
 && find node_modules/.prisma .next/standalone/node_modules/.prisma -name 'libquery_engine-rhel-*' -delete
# seed.ts → prisma/seed.mjs, деректі көшіру (#66) → prisma/import-data.mjs (tsx-пен бірге келген esbuild; пакеттер — runtime node_modules-тен)
RUN npx esbuild prisma/seed.ts --bundle --platform=node --format=esm --target=node22 --packages=external --outfile=prisma/seed.mjs \
 && npx esbuild scripts/import-data.ts --bundle --platform=node --format=esm --target=node22 --packages=external --outfile=prisma/import-data.mjs
# Prisma CLI бөлек қалтада: runtime-ға бүкіл dev node_modules кірмейді
RUN --mount=type=cache,target=/root/.npm mkdir -p /opt/prisma-cli && cd /opt/prisma-cli \
 && echo '{"name":"prisma-cli","private":true}' > package.json \
 && npm install --no-audit --no-fund "prisma@$(node -p "require('/app/node_modules/prisma/package.json').version")"

# 3. Runtime: тек standalone сервер, статика, Prisma клиенті/engine, миграциялар, seed және көшіру скрипті
FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Next-тің file tracing-і engine файлын әрдайым көшіре бермейді — Prisma клиентін толық қоямыз
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build --chown=node:node /app/prisma/schema.prisma /app/prisma/seed.mjs /app/prisma/import-data.mjs ./prisma/
COPY --from=build --chown=node:node /app/prisma/migrations ./prisma/migrations
COPY --from=build --chown=node:node /app/prisma/seed-data ./prisma/seed-data
COPY --from=build /opt/prisma-cli /opt/prisma-cli
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["entrypoint"]
CMD ["node", "server.js"]
