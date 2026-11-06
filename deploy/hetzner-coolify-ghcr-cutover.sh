#!/bin/bash
# Prepare Hetzner Coolify apps for GHCR-backed Deploy (T-035).
# Default: clean git auth, deploy key, compose overlays, optional GHCR login.
# APPLY_OWNERSHIP=1 disables systemd and POSTs Coolify Deploy (Dev then Prod).
set -euo pipefail

COOLIFY_TOKEN="${COOLIFY_TOKEN:?COOLIFY_TOKEN required}"
GHCR_PULL_TOKEN="${GHCR_PULL_TOKEN:-}"
GHCR_USER="${GHCR_USER:-x-access-token}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/big-drops-mg/data-access-1}"
DEV_UUID="${COOLIFY_DEV_APP_UUID:-on2w1x687uds8rjrd87gmroe}"
PROD_UUID="${COOLIFY_PROD_APP_UUID:-3pb3hedu9l107fy64pwk0zhd}"
APPLY_OWNERSHIP="${APPLY_OWNERSHIP:-0}"
DEV_TAG="${DEV_TAG:-}"
PROD_TAG="${PROD_TAG:-}"
API="http://127.0.0.1:8000/api/v1"
KEY_DIR=/data/coolify/ssh
KEY_PATH="${KEY_DIR}/emailhub-github-deploy"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

CID=$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
test -n "$CID"

echo "=== ensure Coolify deploy key on disk ==="
mkdir -p "$KEY_DIR"
if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -f "$KEY_PATH" -N '' -C 'coolify-emailhub-deploy'
fi
PUB=$(cat "${KEY_PATH}.pub")
FP=$(ssh-keygen -lf "$KEY_PATH" | awk '{print $2}')

echo "=== upsert private_keys row ==="
python3 "$SCRIPT_DIR/hetzner-upsert-coolify-deploy-key.py" "$KEY_PATH" "$FP" /tmp/upsert_pk.sql
docker cp /tmp/upsert_pk.sql "$CID":/tmp/upsert_pk.sql
docker exec "$CID" psql -U coolify -d coolify -v ON_ERROR_STOP=1 -f /tmp/upsert_pk.sql
rm -f /tmp/upsert_pk.sql

KEY_ID=$(docker exec "$CID" psql -U coolify -d coolify -tAc "SELECT id FROM private_keys WHERE name='emailhub-github-deploy' LIMIT 1")
test -n "$KEY_ID"

echo "=== point apps at clean HTTPS git URL + /opt coolify-up.sh ==="
# Deploy keys are disabled on this GitHub org — keep a clean HTTPS URL (no PAT in URL).
# Coolify start uses /opt/*/coolify-up.sh so Deploy does not need a git clone.
install -m 0755 "$SCRIPT_DIR/coolify-up.prod.sh" /opt/emailhub/coolify-up.sh
install -m 0755 "$SCRIPT_DIR/coolify-up.dev.sh" /opt/emailhub-dev/coolify-up.sh
if [[ -f "$SCRIPT_DIR/../docker-compose.coolify-labels.prod.yml" ]]; then
  cp "$SCRIPT_DIR/../docker-compose.coolify-labels.prod.yml" /opt/emailhub/docker-compose.coolify-labels.yml
fi
if [[ -f "$SCRIPT_DIR/../docker-compose.coolify-labels.dev.yml" ]]; then
  cp "$SCRIPT_DIR/../docker-compose.coolify-labels.dev.yml" /opt/emailhub-dev/docker-compose.coolify-labels.yml
fi

docker exec "$CID" psql -U coolify -d coolify -v ON_ERROR_STOP=1 -c \
  "UPDATE applications
   SET git_repository = 'https://github.com/Big-Drops-MG/data-access-1.git',
       private_key_id = ${KEY_ID},
       docker_compose_location = '/docker-compose.yml',
       updated_at = NOW()
   WHERE deleted_at IS NULL;"

docker exec "$CID" psql -U coolify -d coolify -v ON_ERROR_STOP=1 -c \
  "UPDATE applications
   SET docker_compose_custom_start_command = '/opt/emailhub/coolify-up.sh',
       git_branch = 'main',
       updated_at = NOW()
   WHERE uuid = '${PROD_UUID}';
   UPDATE applications
   SET docker_compose_custom_start_command = '/opt/emailhub-dev/coolify-up.sh',
       git_branch = 'dev',
       updated_at = NOW()
   WHERE uuid = '${DEV_UUID}';"

echo "=== ensure raw compose + auto deploy flags ==="
docker exec "$CID" psql -U coolify -d coolify -v ON_ERROR_STOP=1 -c \
  "UPDATE application_settings
   SET is_raw_compose_deployment_enabled = true,
       is_auto_deploy_enabled = true,
       updated_at = NOW()
   WHERE application_id IN (SELECT id FROM applications WHERE deleted_at IS NULL);"

echo "=== dedupe Coolify environment_variables (keep newest id per key) ==="
docker exec "$CID" psql -U coolify -d coolify -v ON_ERROR_STOP=1 -c \
  "DELETE FROM environment_variables e
   USING environment_variables d
   WHERE e.resourceable_type LIKE '%Application%'
     AND d.resourceable_type = e.resourceable_type
     AND d.resourceable_id = e.resourceable_id
     AND d.key = e.key
     AND e.id < d.id;"

echo "DEPLOY_PUBLIC_KEY<<EOF"
echo "$PUB"
echo "EOF"

if [[ -n "$GHCR_PULL_TOKEN" ]]; then
  echo "=== docker login ghcr.io ==="
  echo "$GHCR_PULL_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
else
  echo "GHCR_PULL_TOKEN unset — skip docker login"
fi

patch_app_image() {
  local uuid="$1"
  local tag="$2"
  local image="${IMAGE_REPO}:${tag}"
  local envfile="$3"
  echo "=== APP_IMAGE ${uuid} -> ${image} ==="
  curl -fsS -X PATCH "${API}/applications/${uuid}/envs" \
    -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"APP_IMAGE\",\"value\":\"${image}\",\"is_literal\":true,\"is_runtime\":true,\"is_buildtime\":true}"
  echo
  curl -fsS -X PATCH "${API}/applications/${uuid}" \
    -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -d "{\"docker_registry_image_name\":\"${IMAGE_REPO}\",\"docker_registry_image_tag\":\"${tag}\"}"
  echo
  if [[ -f "$envfile" ]]; then
    python3 - "$envfile" "$image" <<'PY'
from pathlib import Path
import sys
path, image = Path(sys.argv[1]), sys.argv[2]
lines = []
for line in path.read_text().splitlines():
    if line.startswith("APP_IMAGE="):
        lines.append(f"APP_IMAGE={image}")
    else:
        lines.append(line)
path.write_text("\n".join(lines) + "\n")
print("updated", path, "APP_IMAGE", image)
PY
  fi
}

if [[ -n "$DEV_TAG" ]]; then
  patch_app_image "$DEV_UUID" "$DEV_TAG" /opt/emailhub-dev/.env.compose
fi
if [[ -n "$PROD_TAG" ]]; then
  patch_app_image "$PROD_UUID" "$PROD_TAG" /opt/emailhub/.env.compose
fi

docker exec "$CID" psql -U coolify -d coolify -c \
  "SELECT name, status, git_repository, private_key_id, left(coalesce(docker_compose_custom_start_command,''), 80) AS start_cmd
   FROM applications WHERE deleted_at IS NULL ORDER BY id;"

if [[ "$APPLY_OWNERSHIP" != "1" ]]; then
  echo "APPLY_OWNERSHIP!=1 — systemd left enabled; Coolify Deploy not triggered"
  exit 0
fi

echo "=== disable systemd; Coolify Deploy Dev then Prod ==="
systemctl disable --now emailhub-dev.service || true
systemctl disable emailhub.service || true
systemctl stop emailhub.service || true

curl -fsS -X POST "${API}/deploy?uuid=${DEV_UUID}&force=true" \
  -H "Authorization: Bearer ${COOLIFY_TOKEN}" -H "Accept: application/json"
echo
for i in $(seq 1 60); do
  code=$(curl -sk -o /tmp/dev-ready.json -w '%{http_code}' -H 'Host: emailhub-hetzner-dev.dataaccess1.net' https://127.0.0.1/api/ready || true)
  if [[ "$code" == "200" ]] && grep -q '"ok":true' /tmp/dev-ready.json; then
    echo "Dev ready after $((i*5))s"; break
  fi
  sleep 5
  if [[ "$i" -eq 60 ]]; then
    echo "Dev failed — restoring systemd emailhub-dev" >&2
    systemctl enable emailhub-dev.service || true
    cd /opt/emailhub-dev && docker compose --env-file .env.compose \
      -f docker-compose.yml -f docker-compose.dev-server.yml \
      -f docker-compose.hetzner-dev.yml -f docker-compose.coolify-labels.yml up -d || true
    exit 1
  fi
done

curl -fsS -X POST "${API}/deploy?uuid=${PROD_UUID}&force=true" \
  -H "Authorization: Bearer ${COOLIFY_TOKEN}" -H "Accept: application/json"
echo
for i in $(seq 1 60); do
  code=$(curl -sk -o /tmp/prod-ready.json -w '%{http_code}' -H 'Host: emailhub-hetzner.dataaccess1.net' https://127.0.0.1/api/ready || true)
  if [[ "$code" == "200" ]] && grep -q '"ok":true' /tmp/prod-ready.json; then
    echo "Prod ready after $((i*5))s"; break
  fi
  sleep 5
  if [[ "$i" -eq 60 ]]; then
    echo "Prod failed — restoring systemd emailhub" >&2
    systemctl enable --now emailhub.service || true
    exit 1
  fi
done

docker exec "$CID" psql -U coolify -d coolify -c \
  "UPDATE applications SET status='running:healthy' WHERE deleted_at IS NULL;
   SELECT name, status FROM applications ORDER BY id;"
echo "Cutover complete"
