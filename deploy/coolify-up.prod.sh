#!/bin/bash
set -euo pipefail
cd /opt/emailhub
exec docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.hetzner.yml -f docker-compose.coolify-labels.yml \
  up -d
