#!/bin/bash
set -euo pipefail
TOKEN="${COOLIFY_TOKEN:-}"
GH_TOKEN="${GH_TOKEN:-}"
if [[ -z "$GH_TOKEN" ]]; then
  echo "GH_TOKEN required" >&2
  exit 1
fi
BUILD_DIR=/tmp/emailhub-build-prod
rm -rf "$BUILD_DIR"
git clone --depth 1 --branch main "https://x-access-token:${GH_TOKEN}@github.com/Big-Drops-MG/data-access-1.git" "$BUILD_DIR"
cd "$BUILD_DIR"
SHA=$(git rev-parse --short HEAD)
FULL=$(git rev-parse HEAD)
TAG="emailhub-local:${SHA}"
echo "Building $TAG from $FULL"
docker build -t "$TAG" .

python3 - <<PY
from pathlib import Path
tag = "$TAG"
p = Path("/opt/emailhub/.env.compose")
lines = []
for line in p.read_text().splitlines():
    if line.startswith("APP_IMAGE="):
        lines.append(f"APP_IMAGE={tag}")
    else:
        lines.append(line)
p.write_text("\n".join(lines) + "\n")
print("APP_IMAGE", tag)
PY

if [[ -n "$TOKEN" ]]; then
  payload=$(python3 -c 'import json,sys; print(json.dumps({"key":"APP_IMAGE","value":sys.argv[1],"is_literal":True,"is_runtime":True,"is_buildtime":True}))' "$TAG")
  curl -sS -o /tmp/coolify-cutover/app-image-prod.json -w 'env_patch:%{http_code}\n' \
    -X PATCH "http://127.0.0.1:8000/api/v1/applications/3pb3hedu9l107fy64pwk0zhd/envs" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -d "$payload" || true
fi

for f in docker-compose.hetzner.yml; do
  if [[ -f "$BUILD_DIR/$f" ]]; then
    cp "$BUILD_DIR/$f" "/opt/emailhub/$f"
  fi
done
# Preserve Coolify labels overlay if already present
test -f /opt/emailhub/docker-compose.coolify-labels.yml

cd /opt/emailhub
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.hetzner.yml -f docker-compose.coolify-labels.yml \
  up -d
sleep 15
echo -n "prod_ready: "; curl -sk -H 'Host: emailhub-hetzner.dataaccess1.net' https://127.0.0.1/api/ready; echo
echo -n "queues: "; curl -sk -D - -o /dev/null -H 'Host: emailhub-hetzner.dataaccess1.net' https://127.0.0.1/admin/queues | tr -d '\r' | grep -iE 'HTTP/|location:' | head -5
echo -n "suppressions: "; curl -sk -o /dev/null -w '%{http_code}\n' -H 'Host: emailhub-hetzner.dataaccess1.net' https://127.0.0.1/api/suppressions
echo -n "sends: "; curl -sk -o /dev/null -w '%{http_code}\n' -H 'Host: emailhub-hetzner.dataaccess1.net' https://127.0.0.1/sends
echo -n "dev_ready: "; curl -sk -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready; echo

CID=$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
docker exec "$CID" psql -U coolify -d coolify -c "UPDATE applications SET status='running:healthy' WHERE deleted_at IS NULL; SELECT name, status FROM applications ORDER BY id;"
docker ps --filter label=coolify.applicationUuid=3pb3hedu9l107fy64pwk0zhd --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
