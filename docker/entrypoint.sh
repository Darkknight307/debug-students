#!/bin/sh
# Контейнер іске қосылғанда (#64): миграциялар → (SEED_ON_START=1 болса) seed → сервер.
# Миграция сәтсіз болса, контейнер нөлдік емес кодпен тоқтайды — қате Prisma хабарымен логта қалады.
set -e
if [ "${DB_DRIVER:-postgres}" = "postgres" ]; then
  node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
  if [ "${SEED_ON_START:-0}" = "1" ]; then node /app/prisma/seed.mjs; fi
fi
exec "$@"
