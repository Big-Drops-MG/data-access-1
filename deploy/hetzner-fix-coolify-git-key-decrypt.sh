#!/bin/bash
# Unblock Coolify Deploy when Git SSH key decrypt fails:
#   DecryptException: The payload is invalid
#
# Root cause we hit: plaintext PEM was SQL-upserted into private_keys.
# Coolify expects Laravel-encrypted ciphertext (APP_KEY). Decrypt then fails
# and EmailHub_App-Dev (or any app with that private_key_id) cannot deploy.
#
# This stack deploys via /opt/emailhub(-dev)/coolify-up.sh + GHCR — no git
# clone is required. Safe fix: detach private_key_id and remove the bad row.
#
# Run on the Hetzner Coolify host (root or docker-capable user):
#   bash deploy/hetzner-fix-coolify-git-key-decrypt.sh
# Optional: TRIGGER_DEPLOY=1 COOLIFY_TOKEN=... to POST Dev (then Prod) deploy.
set -euo pipefail

DEV_UUID="${COOLIFY_DEV_APP_UUID:-on2w1x687uds8rjrd87gmroe}"
PROD_UUID="${COOLIFY_PROD_APP_UUID:-3pb3hedu9l107fy64pwk0zhd}"
KEY_NAME="${COOLIFY_GIT_KEY_NAME:-emailhub-github-deploy}"
TRIGGER_DEPLOY="${TRIGGER_DEPLOY:-0}"
COOLIFY_TOKEN="${COOLIFY_TOKEN:-}"
API="http://127.0.0.1:8000/api/v1"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

CID=$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
test -n "$CID"

echo "=== before ==="
docker exec "$CID" psql -U coolify -d coolify -c \
  "SELECT a.name, a.uuid, a.private_key_id, pk.name AS key_name,
          left(coalesce(a.docker_compose_custom_start_command,''), 64) AS start_cmd
   FROM applications a
   LEFT JOIN private_keys pk ON pk.id = a.private_key_id
   WHERE a.deleted_at IS NULL
   ORDER BY a.id;"

echo "=== detach private_key_id from EmailHub apps ==="
docker exec "$CID" psql -U coolify -d coolify -v ON_ERROR_STOP=1 -c \
  "UPDATE applications
   SET private_key_id = NULL, updated_at = NOW()
   WHERE deleted_at IS NULL
     AND uuid IN ('${DEV_UUID}', '${PROD_UUID}');"

echo "=== delete plaintext/corrupt Coolify git key row (${KEY_NAME}) ==="
docker exec "$CID" psql -U coolify -d coolify -v ON_ERROR_STOP=1 -c \
  "DELETE FROM private_keys WHERE name = '${KEY_NAME}';"

echo "=== ensure coolify-up start commands (no git clone) ==="
if [[ -f "$SCRIPT_DIR/coolify-up.prod.sh" ]]; then
  install -m 0755 "$SCRIPT_DIR/coolify-up.prod.sh" /opt/emailhub/coolify-up.sh
fi
if [[ -f "$SCRIPT_DIR/coolify-up.dev.sh" ]]; then
  install -m 0755 "$SCRIPT_DIR/coolify-up.dev.sh" /opt/emailhub-dev/coolify-up.sh
fi
docker exec "$CID" psql -U coolify -d coolify -v ON_ERROR_STOP=1 -c \
  "UPDATE applications
   SET docker_compose_custom_start_command = '/opt/emailhub/coolify-up.sh',
       git_repository = 'https://github.com/Big-Drops-MG/data-access-1.git',
       git_branch = 'main',
       updated_at = NOW()
   WHERE uuid = '${PROD_UUID}';
   UPDATE applications
   SET docker_compose_custom_start_command = '/opt/emailhub-dev/coolify-up.sh',
       git_repository = 'https://github.com/Big-Drops-MG/data-access-1.git',
       git_branch = 'dev',
       updated_at = NOW()
   WHERE uuid = '${DEV_UUID}';"

echo "=== clear Coolify SSH key cache files (if present) ==="
COOLIFY_APP=$(docker ps --filter name=^coolify$ --format '{{.ID}}' | head -1)
if [[ -n "$COOLIFY_APP" ]]; then
  docker exec "$COOLIFY_APP" sh -c \
    'rm -f /var/www/html/storage/app/ssh/keys/* 2>/dev/null || true' || true
fi

echo "=== after ==="
docker exec "$CID" psql -U coolify -d coolify -c \
  "SELECT a.name, a.uuid, a.private_key_id,
          left(coalesce(a.docker_compose_custom_start_command,''), 64) AS start_cmd
   FROM applications a
   WHERE a.deleted_at IS NULL
   ORDER BY a.id;
   SELECT id, name FROM private_keys WHERE name = '${KEY_NAME}';"

if [[ "$TRIGGER_DEPLOY" == "1" ]]; then
  test -n "$COOLIFY_TOKEN"
  echo "=== POST Coolify Deploy Dev ==="
  curl -fsS -X POST "${API}/deploy?uuid=${DEV_UUID}&force=true" \
    -H "Authorization: Bearer ${COOLIFY_TOKEN}" -H "Accept: application/json"
  echo
  echo "=== POST Coolify Deploy Prod ==="
  curl -fsS -X POST "${API}/deploy?uuid=${PROD_UUID}&force=true" \
    -H "Authorization: Bearer ${COOLIFY_TOKEN}" -H "Accept: application/json"
  echo
fi

echo "Done. If a Git deploy key is required later, add it only via Coolify UI"
echo "(Keys → Private Keys). Never SQL-insert a PEM into private_keys."
