#!/bin/bash
set -euo pipefail
TOKEN="${COOLIFY_TOKEN:?}"
API="http://127.0.0.1:8000/api/v1"
CID=$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
DEV_UUID="on2w1x687uds8rjrd87gmroe"

# Ensure flags still set
docker exec "$CID" psql -U coolify -d coolify -c "UPDATE applications SET build_pack='dockercompose', git_branch='dev' WHERE uuid='$DEV_UUID'; UPDATE application_settings SET is_raw_compose_deployment_enabled=true WHERE application_id=(SELECT id FROM applications WHERE uuid='$DEV_UUID');"

echo "=== POST deploy ==="
curl -sS -o /tmp/coolify-cutover/dev-deploy2.json -w 'HTTP %{http_code}\n' \
  -X POST -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' \
  "$API/deploy?uuid=$DEV_UUID&force=true"
cat /tmp/coolify-cutover/dev-deploy2.json; echo

DEP_UUID=$(python3 -c 'import json; print(json.load(open("/tmp/coolify-cutover/dev-deploy2.json"))["deployments"][0]["deployment_uuid"])')
echo "DEP_UUID=$DEP_UUID"

for i in $(seq 1 90); do
  st=$(docker exec "$CID" psql -U coolify -d coolify -tAc "SELECT status FROM application_deployment_queues WHERE deployment_uuid='$DEP_UUID'" | tr -d '[:space:]')
  app=$(docker exec "$CID" psql -U coolify -d coolify -tAc "SELECT status FROM applications WHERE uuid='$DEV_UUID'" | tr -d '[:space:]')
  ready=$(curl -sk -o /tmp/coolify-cutover/dev-ready.json -w '%{http_code}' -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready || true)
  echo "t=$i deploy=$st app=$app ready=$ready"
  if [[ "$st" == "finished" || "$st" == "failed" || "$st" == "cancelled" ]]; then
    break
  fi
  sleep 5
done

echo "=== deploy log tail ==="
docker exec "$CID" psql -U coolify -d coolify -tAc "SELECT logs FROM application_deployment_queues WHERE deployment_uuid='$DEP_UUID'" | python3 - <<'PY'
import sys, json
raw=sys.stdin.read()
try:
  logs=json.loads(raw)
except Exception:
  print(raw[-3000:]); raise SystemExit
for e in logs[-25:]:
  if e.get('hidden'): continue
  print(e.get('type'), e.get('output','')[:300])
PY

echo "=== containers ==="
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'NAME|emailhub-dev|on2w' || true
WEB=$(docker ps --format '{{.Names}}' | grep web | head -5)
echo "$WEB"
for w in $WEB; do
  echo "-- $w"
  docker inspect "$w" --format '{{json .Config.Labels}}' | python3 -c 'import sys,json; d=json.load(sys.stdin); print({k:v for k,v in d.items() if "coolify" in k.lower() or k=="com.docker.compose.project"})'
done
curl -sk -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready; echo
