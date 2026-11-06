#!/bin/bash
set -euo pipefail
TOKEN="${COOLIFY_TOKEN:?}"
API="http://127.0.0.1:8000/api/v1"
CID=$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
DEV_UUID="on2w1x687uds8rjrd87gmroe"
PROD_UUID="3pb3hedu9l107fy64pwk0zhd"

python3 - "$CID" "$DEV_UUID" "$PROD_UUID" <<'PY'
import pathlib, subprocess, sys, re
cid, dev_uuid, prod_uuid = sys.argv[1:4]

def patch(raw: str) -> str:
    # Add pull_policy: never under web/worker image lines if missing
    lines = raw.splitlines()
    out = []
    i = 0
    in_target = False
    service = None
    while i < len(lines):
        line = lines[i]
        m = re.match(r'^  ([a-zA-Z0-9_-]+):\s*$', line)
        if m:
            service = m.group(1)
            in_target = service in ('web', 'worker')
            out.append(line)
            i += 1
            continue
        if in_target and re.match(r'^    image:\s*', line):
            out.append(line)
            # peek next non-empty
            j = i + 1
            has_pull = False
            while j < len(lines) and (lines[j].startswith('      ') or lines[j].strip() == ''):
                if 'pull_policy:' in lines[j]:
                    has_pull = True
                    break
                if re.match(r'^    [a-zA-Z]', lines[j]):
                    break
                j += 1
            if not has_pull:
                out.append('    pull_policy: never')
            i += 1
            continue
        if re.match(r'^  [a-zA-Z0-9_-]+:\s*$', line):
            in_target = False
        out.append(line)
        i += 1
    return '\n'.join(out) + '\n'

def load(uuid, text):
    tag = 'COMPOSEYAML'
    while tag in text:
        tag += 'X'
    sql = (
        'UPDATE applications SET docker_compose_raw = $' + tag + '$' + text + '$' + tag +
        '$, docker_compose = $' + tag + '$' + text + '$' + tag +
        '$, updated_at = NOW() WHERE uuid = \'' + uuid + '\';'
    )
    subprocess.run(
        ['docker', 'exec', '-i', cid, 'psql', '-U', 'coolify', '-d', 'coolify', '-v', 'ON_ERROR_STOP=1'],
        input=sql, text=True, check=True,
    )
    print('patched', uuid, 'bytes', len(text))

for uuid in (dev_uuid, prod_uuid):
    raw = subprocess.check_output(
        ['docker', 'exec', cid, 'psql', '-U', 'coolify', '-d', 'coolify', '-tAc',
         f"SELECT docker_compose_raw FROM applications WHERE uuid='{uuid}'"],
        text=True,
    )
    # psql may append newline; raw YAML starts with name:
    if not raw.lstrip().startswith('name:'):
        raise SystemExit(f'unexpected raw for {uuid}: {raw[:80]!r}')
    load(uuid, patch(raw))
PY

echo "=== redeploy Dev ==="
curl -sS -o /tmp/coolify-cutover/dev-deploy3.json -w 'HTTP %{http_code}\n' \
  -X POST -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' \
  "$API/deploy?uuid=$DEV_UUID&force=true"
cat /tmp/coolify-cutover/dev-deploy3.json; echo
DEP_UUID=$(python3 -c 'import json; print(json.load(open("/tmp/coolify-cutover/dev-deploy3.json"))["deployments"][0]["deployment_uuid"])')
for i in $(seq 1 90); do
  st=$(docker exec "$CID" psql -U coolify -d coolify -tAc "SELECT status FROM application_deployment_queues WHERE deployment_uuid='$DEP_UUID'" | tr -d '[:space:]')
  ready=$(curl -sk -o /dev/null -w '%{http_code}' -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready || true)
  echo "t=$i deploy=$st ready=$ready"
  if [[ "$st" == "finished" || "$st" == "failed" || "$st" == "cancelled" ]]; then break; fi
  sleep 5
done
docker exec "$CID" psql -U coolify -d coolify -tAc "SELECT logs FROM application_deployment_queues WHERE deployment_uuid='$DEP_UUID'" > /tmp/coolify-cutover/dep3.json
python3 - <<'PY'
import json
logs=json.load(open('/tmp/coolify-cutover/dep3.json'))
for e in logs:
  if e.get('hidden'): continue
  print(e.get('type'), (e.get('output') or '')[:500])
  print('---')
PY
echo "=== app status / containers ==="
docker exec "$CID" psql -U coolify -d coolify -c "SELECT name, status FROM applications ORDER BY id;"
docker ps --format 'table {{.Names}}\t{{.Status}}' | sed -n '1,40p'
