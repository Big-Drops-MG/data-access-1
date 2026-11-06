#!/bin/bash
# Open SSH local forwards from the Actions runner to Hetzner Postgres + ClickHouse
# containers (resolved by docker inspect on the remote host).
# Usage: ci-tunnel-hetzner-dbs.sh <postgres-container> <clickhouse-container>
set -euo pipefail

PG_CONTAINER="${1:?postgres container name required}"
CH_CONTAINER="${2:?clickhouse container name required}"
test -n "${HETZNER_SSH_HOST:-}"
test -n "${HETZNER_SSH_USER:-}"
test -n "${HETZNER_SSH_KEY:-}"

mkdir -p ~/.ssh
printf '%s\n' "$HETZNER_SSH_KEY" > ~/.ssh/hetzner_deploy
chmod 600 ~/.ssh/hetzner_deploy
SSH=(ssh -o BatchMode=yes -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new -i ~/.ssh/hetzner_deploy)

PG_IP="$("${SSH[@]}" "${HETZNER_SSH_USER}@${HETZNER_SSH_HOST}" \
  "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${PG_CONTAINER}" | awk '{print $1}')"
CH_IP="$("${SSH[@]}" "${HETZNER_SSH_USER}@${HETZNER_SSH_HOST}" \
  "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${CH_CONTAINER}" | awk '{print $1}')"
test -n "$PG_IP"
test -n "$CH_IP"
echo "Tunneling Postgres ${PG_CONTAINER}=${PG_IP}:5432 -> 127.0.0.1:15432"
echo "Tunneling ClickHouse ${CH_CONTAINER}=${CH_IP}:8123 -> 127.0.0.1:18123"

"${SSH[@]}" -fN \
  -L "15432:${PG_IP}:5432" \
  -L "18123:${CH_IP}:8123" \
  "${HETZNER_SSH_USER}@${HETZNER_SSH_HOST}"

for i in $(seq 1 30); do
  if (echo >/dev/tcp/127.0.0.1/15432) >/dev/null 2>&1 \
    && (echo >/dev/tcp/127.0.0.1/18123) >/dev/null 2>&1; then
    echo "DB tunnels ready"
    exit 0
  fi
  sleep 1
done
echo "DB tunnels did not become ready" >&2
exit 1
