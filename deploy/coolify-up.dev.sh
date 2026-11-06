#!/bin/bash
set -euo pipefail
cd /opt/emailhub-dev
exec docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.dev-server.yml -f docker-compose.hetzner-dev.yml -f docker-compose.coolify-labels.yml \
  up -d
