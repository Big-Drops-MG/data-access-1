#!/bin/bash
set -euo pipefail
TOKEN="${COOLIFY_TOKEN:?}"
API="http://127.0.0.1:8000/api/v1"
CID=$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
DEV_UUID="on2w1x687uds8rjrd87gmroe"
PROD_UUID="3pb3hedu9l107fy64pwk0zhd"

mkdir -p /tmp/coolify-cutover

# Rebuild merged compose without interpolate
cd /opt/emailhub-dev
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.dev-server.yml -f docker-compose.hetzner.yml \
  config --no-interpolate > /tmp/coolify-cutover/dev.raw.yml
cd /opt/emailhub
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.hetzner.yml \
  config --no-interpolate > /tmp/coolify-cutover/prod.raw.yml

python3 - <<'PY'
from pathlib import Path
import re

def prepare(path: Path, name: str) -> str:
    lines = path.read_text().splitlines()
    if lines and lines[0].startswith('name:'):
        lines[0] = f'name: {name}'
    else:
        lines.insert(0, f'name: {name}')
    # inject pull_policy: never for web/worker
    out = []
    service = None
    for i, line in enumerate(lines):
        m = re.match(r'^  ([a-zA-Z0-9_-]+):\s*$', line)
        if m:
            service = m.group(1)
            out.append(line)
            continue
        if service in ('web', 'worker') and re.match(r'^    image:\s*', line):
            out.append(line)
            # check if next lines already have pull_policy at same indent level before next key
            out.append('    pull_policy: never')
            continue
        out.append(line)
    # dedupe consecutive pull_policy
    final = []
    prev = None
    for line in out:
        if line.strip() == 'pull_policy: never' and prev and prev.strip() == 'pull_policy: never':
            continue
        final.append(line)
        prev = line
    return '\n'.join(final) + '\n'

Path('/tmp/coolify-cutover/dev.raw.yml').write_text(prepare(Path('/tmp/coolify-cutover/dev.raw.yml'), 'emailhub-dev'))
Path('/tmp/coolify-cutover/prod.raw.yml').write_text(prepare(Path('/tmp/coolify-cutover/prod.raw.yml'), 'emailhub'))
print('prepared')
PY

python3 - "$CID" "$DEV_UUID" "$PROD_UUID" <<'PY'
import pathlib, subprocess, sys
cid, dev_uuid, prod_uuid = sys.argv[1:4]

def load(uuid, path):
    raw = pathlib.Path(path).read_text()
    tag = 'COMPOSEYAML'
    while tag in raw:
        tag += 'X'
    sql = (
        'UPDATE applications SET docker_compose_raw = $' + tag + '$' + raw + '$' + tag +
        '$, docker_compose = $' + tag + '$' + raw + '$' + tag +
        '$, build_pack = \'dockercompose\', updated_at = NOW() WHERE uuid = \'' + uuid + '\';'
    )
    subprocess.run(
        ['docker', 'exec', '-i', cid, 'psql', '-U', 'coolify', '-d', 'coolify', '-v', 'ON_ERROR_STOP=1'],
        input=sql, text=True, check=True,
    )
    print('loaded', uuid, len(raw))

load(dev_uuid, '/tmp/coolify-cutover/dev.raw.yml')
load(prod_uuid, '/tmp/coolify-cutover/prod.raw.yml')
PY

docker exec "$CID" psql -U coolify -d coolify -c "UPDATE application_settings SET is_raw_compose_deployment_enabled=true WHERE application_id IN (1,2); SELECT a.name, left(a.docker_compose_raw,40), s.is_raw_compose_deployment_enabled FROM applications a JOIN application_settings s ON s.application_id=a.id ORDER BY a.id;"

echo "=== stop local Dev compose so Coolify can take Traefik host ==="
cd /opt/emailhub-dev
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.dev-server.yml -f docker-compose.hetzner.yml \
  stop

echo "=== deploy Dev ==="
curl -sS -o /tmp/coolify-cutover/dev-deploy4.json -w 'HTTP %{http_code}\n' \
  -X POST -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' \
  "$API/deploy?uuid=$DEV_UUID&force=true"
cat /tmp/coolify-cutover/dev-deploy4.json; echo
DEP_UUID=$(python3 -c 'import json; print(json.load(open("/tmp/coolify-cutover/dev-deploy4.json"))["deployments"][0]["deployment_uuid"])')

for i in $(seq 1 90); do
  st=$(docker exec "$CID" psql -U coolify -d coolify -tAc "SELECT status FROM application_deployment_queues WHERE deployment_uuid='$DEP_UUID'" | tr -d '[:space:]')
  ready=$(curl -sk -o /dev/null -w '%{http_code}' -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready || true)
  echo "t=$i deploy=$st ready=$ready"
  if [[ "$st" == "finished" || "$st" == "failed" || "$st" == "cancelled" ]]; then break; fi
  sleep 5
done

docker exec "$CID" psql -U coolify -d coolify -tAc "SELECT logs FROM application_deployment_queues WHERE deployment_uuid='$DEP_UUID'" > /tmp/coolify-cutover/dep4.json
python3 - <<'PY'
import json
logs=json.load(open('/tmp/coolify-cutover/dep4.json'))
for e in logs:
  if e.get('hidden'): continue
  print(e.get('type'), (e.get('output') or '')[:600])
  print('---')
PY

docker exec "$CID" psql -U coolify -d coolify -c "SELECT name, status FROM applications ORDER BY id;"
docker ps --format 'table {{.Names}}\t{{.Status}}' | sed -n '1,50p'
curl -sk -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready; echo
# show coolify labels if any web container
for w in $(docker ps --format '{{.Names}}' | grep -E 'web'); do
  echo "LABELS $w"
  docker inspect "$w" --format '{{json .Config.Labels}}' | python3 -c 'import sys,json; d=json.load(sys.stdin); print({k:v for k,v in d.items() if "coolify" in k.lower() or k.startswith("com.docker.compose.project")})'
done
