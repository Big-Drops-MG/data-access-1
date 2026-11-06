#!/bin/bash
set -euo pipefail
CID=$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
docker exec "$CID" psql -U coolify -d coolify -tAc "SELECT logs FROM application_deployment_queues WHERE deployment_uuid='ifnsxns2aqrp0vxbovhgafho'" > /tmp/coolify-cutover/fail.json
python3 - <<'PY'
import json
logs=json.load(open('/tmp/coolify-cutover/fail.json'))
for e in logs:
    if e.get('hidden'):
        continue
    out=(e.get('output') or '')
    print(e.get('type'), out[:800])
    print('---')
PY
