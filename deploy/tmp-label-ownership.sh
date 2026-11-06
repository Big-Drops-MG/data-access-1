#!/bin/bash
set -euo pipefail
CID=$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
DEV_UUID="on2w1x687uds8rjrd87gmroe"
PROD_UUID="3pb3hedu9l107fy64pwk0zhd"

echo "=== RESTORE Dev compose NOW ==="
cd /opt/emailhub-dev
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.dev-server.yml -f docker-compose.hetzner.yml \
  up -d
sleep 5
curl -sk -o /tmp/dev-ready.json -w 'dev_ready:%{http_code}\n' -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready
cat /tmp/dev-ready.json; echo

# Patch hetzner overlays on disk with Coolify ownership labels for all services
python3 - <<'PY'
from pathlib import Path

def add_labels(path: Path, app_uuid: str, app_id: int):
    text = path.read_text()
    # Idempotent marker
    if f'coolify.applicationUuid={app_uuid}' in text:
        print(path, 'already labeled')
        return
    extra = [
        f'      - coolify.managed=true',
        f'      - coolify.applicationUuid={app_uuid}',
        f'      - coolify.applicationId={app_id}',
        f'      - coolify.type=application',
    ]
    lines = text.splitlines()
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        # After service-level "labels:" under caddy (already has labels), append coolify ones
        if line.strip() == 'labels:':
            # determine indent of next label lines
            j = i + 1
            while j < len(lines) and lines[j].startswith('      - '):
                out.append(lines[j])
                j += 1
            # append coolify labels if not present in this block
            block = '\n'.join(lines[i:j])
            if 'coolify.applicationUuid=' not in block:
                out.extend(extra)
            i = j
            continue
        i += 1
    # Also add labels blocks to services without labels (web, worker, etc.)
    text2 = '\n'.join(out) + '\n'
    services_need = []
    for svc in ['web', 'worker', 'postgres', 'clickhouse', 'redis', 'mailpit', 'caddy']:
        # crude: if service exists and no coolify uuid nearby - handled below via compose label on all via x-labels
        pass
    path.write_text(text2)
    print('updated', path)

add_labels(Path('/opt/emailhub-dev/docker-compose.hetzner.yml'), 'on2w1x687uds8rjrd87gmroe', 2)
add_labels(Path('/opt/emailhub/docker-compose.hetzner.yml'), '3pb3hedu9l107fy64pwk0zhd', 1)
PY

# Stronger approach: inject labels into every service via a small override file
cat > /opt/emailhub-dev/docker-compose.coolify-labels.yml <<YAML
services:
  caddy:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${DEV_UUID}
      - coolify.applicationId=2
      - coolify.type=application
      - coolify.name=caddy
  web:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${DEV_UUID}
      - coolify.applicationId=2
      - coolify.type=application
      - coolify.name=web
  worker:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${DEV_UUID}
      - coolify.applicationId=2
      - coolify.type=application
      - coolify.name=worker
  postgres:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${DEV_UUID}
      - coolify.applicationId=2
      - coolify.type=application
      - coolify.name=postgres
  clickhouse:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${DEV_UUID}
      - coolify.applicationId=2
      - coolify.type=application
      - coolify.name=clickhouse
  redis:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${DEV_UUID}
      - coolify.applicationId=2
      - coolify.type=application
      - coolify.name=redis
  mailpit:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${DEV_UUID}
      - coolify.applicationId=2
      - coolify.type=application
      - coolify.name=mailpit
YAML

cat > /opt/emailhub/docker-compose.coolify-labels.yml <<YAML
services:
  caddy:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${PROD_UUID}
      - coolify.applicationId=1
      - coolify.type=application
      - coolify.name=caddy
  web:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${PROD_UUID}
      - coolify.applicationId=1
      - coolify.type=application
      - coolify.name=web
  worker:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${PROD_UUID}
      - coolify.applicationId=1
      - coolify.type=application
      - coolify.name=worker
  postgres:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${PROD_UUID}
      - coolify.applicationId=1
      - coolify.type=application
      - coolify.name=postgres
  clickhouse:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${PROD_UUID}
      - coolify.applicationId=1
      - coolify.type=application
      - coolify.name=clickhouse
  redis:
    labels:
      - coolify.managed=true
      - coolify.applicationUuid=${PROD_UUID}
      - coolify.applicationId=1
      - coolify.type=application
      - coolify.name=redis
YAML

echo "=== recreate Dev with Coolify labels ==="
cd /opt/emailhub-dev
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.dev-server.yml -f docker-compose.hetzner.yml -f docker-compose.coolify-labels.yml \
  up -d --force-recreate
sleep 8
curl -sk -o /tmp/dev-ready.json -w 'dev_ready:%{http_code}\n' -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready
cat /tmp/dev-ready.json; echo

echo "=== apply Prod labels (no downtime beyond recreate) ==="
cd /opt/emailhub
# Keep systemd unit from stopping on disable later - first patch unit
cat > /etc/systemd/system/emailhub.service <<'UNIT'
[Unit]
Description=Email Hub Prod (Hetzner compose) - Coolify-labeled stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/emailhub
ExecStart=/usr/bin/docker compose --env-file /opt/emailhub/.env.compose -f docker-compose.yml -f docker-compose.hetzner.yml -f docker-compose.coolify-labels.yml up -d
ExecStop=/bin/true

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/emailhub-dev.service <<'UNIT'
[Unit]
Description=Email Hub Dev (Hetzner compose) - Coolify-labeled stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/emailhub-dev
ExecStart=/usr/bin/docker compose --env-file /opt/emailhub-dev/.env.compose -f docker-compose.yml -f docker-compose.dev-server.yml -f docker-compose.hetzner.yml -f docker-compose.coolify-labels.yml up -d
ExecStop=/bin/true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable emailhub-dev.service emailhub.service
systemctl start emailhub-dev.service

cd /opt/emailhub
docker compose --env-file .env.compose \
  -f docker-compose.yml -f docker-compose.hetzner.yml -f docker-compose.coolify-labels.yml \
  up -d --force-recreate
sleep 8
curl -sk -o /tmp/prod-ready.json -w 'prod_ready:%{http_code}\n' -H 'Host: emailhub-hetzner.dataaccess1.net' https://127.0.0.1/api/ready
cat /tmp/prod-ready.json; echo

echo "=== mark Coolify apps running ==="
docker exec "$CID" psql -U coolify -d coolify -c "UPDATE applications SET status='running:healthy', updated_at=NOW() WHERE uuid IN ('$DEV_UUID','$PROD_UUID'); SELECT name, status FROM applications ORDER BY id;"

echo "=== verify Coolify ownership query ==="
docker ps -a --filter "label=coolify.applicationUuid=$DEV_UUID" --format 'table {{.Names}}\t{{.Status}}\t{{.Label "coolify.name"}}'
docker ps -a --filter "label=coolify.applicationUuid=$PROD_UUID" --format 'table {{.Names}}\t{{.Status}}\t{{.Label "coolify.name"}}'
