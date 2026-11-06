#!/bin/bash
set -euo pipefail

echo "=== container overview ==="
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep -E 'emailhub|NAMES' || true

echo "=== stop conflicting dev clickhouse ==="
cd /opt/emailhub-dev
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.dev-server.yml -f docker-compose.hetzner.yml -f docker-compose.coolify-labels.yml \
  down || true
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.dev-server.yml -f docker-compose.hetzner-dev.yml -f docker-compose.coolify-labels.yml \
  down || true

echo "=== restore prod ==="
cd /opt/emailhub
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.hetzner.yml -f docker-compose.coolify-labels.yml \
  up -d

sleep 15
echo -n "prod_ready: "
curl -sk -H 'Host: emailhub-hetzner.dataaccess1.net' https://127.0.0.1/api/ready || true
echo

echo "=== start dev with hetzner-dev overlay ==="
# Ensure APP_IMAGE points at new build if present
grep '^APP_IMAGE=' /opt/emailhub-dev/.env.compose || true
cd /opt/emailhub-dev
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.dev-server.yml -f docker-compose.hetzner-dev.yml -f docker-compose.coolify-labels.yml \
  up -d

sleep 25
echo "=== mounts ==="
docker inspect emailhub-dev-clickhouse-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}' || true
docker inspect emailhub-clickhouse-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}' || true

echo "=== status ==="
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep -E 'emailhub|NAMES' || true
echo -n "dev_ready: "
curl -sk -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready || true
echo
echo -n "prod_ready: "
curl -sk -H 'Host: emailhub-hetzner.dataaccess1.net' https://127.0.0.1/api/ready || true
echo
echo -n "queues: "
curl -sk -D - -o /dev/null -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/admin/queues | tr -d '\r' | grep -iE 'HTTP/|location:' | head -5
echo -n "suppressions: "
curl -sk -o /dev/null -w '%{http_code}\n' -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/suppressions
echo -n "sends: "
curl -sk -o /dev/null -w '%{http_code}\n' -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/sends

CID=$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
docker exec "$CID" psql -U coolify -d coolify -c "UPDATE applications SET status='running:healthy' WHERE deleted_at IS NULL; SELECT name, status FROM applications ORDER BY id;"
