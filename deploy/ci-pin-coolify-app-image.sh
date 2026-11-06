#!/bin/bash
# Pin Coolify APP_IMAGE on Hetzner via Coolify DB + .env.compose, then POST deploy.
# Coolify 4.6 /applications/{uuid}/envs returns HTTP 500 on this host; compose
# start uses /opt/*/coolify-up.sh which reads .env.compose APP_IMAGE.
#
# Usage: ci-pin-coolify-app-image.sh <app-uuid> <app-image> <env-compose-path>
# Env: HETZNER_SSH_HOST, HETZNER_SSH_USER, HETZNER_SSH_KEY, COOLIFY_TOKEN
set -euo pipefail

APP_UUID="${1:?app uuid required}"
APP_IMAGE="${2:?app image required}"
ENV_COMPOSE="${3:?.env.compose path required}"
test -n "${HETZNER_SSH_HOST:-}"
test -n "${HETZNER_SSH_USER:-}"
test -n "${HETZNER_SSH_KEY:-}"
test -n "${COOLIFY_TOKEN:-}"

IMAGE_NAME="${APP_IMAGE%:*}"
IMAGE_TAG="${APP_IMAGE##*:}"
test -n "$IMAGE_NAME"
test -n "$IMAGE_TAG"
test "$IMAGE_NAME" != "$APP_IMAGE"

mkdir -p ~/.ssh
printf '%s\n' "$HETZNER_SSH_KEY" > ~/.ssh/hetzner_deploy
chmod 600 ~/.ssh/hetzner_deploy

# Quote values locally so metacharacters in COOLIFY_TOKEN (e.g. '|') are safe.
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  -i ~/.ssh/hetzner_deploy \
  "${HETZNER_SSH_USER}@${HETZNER_SSH_HOST}" \
  bash -s <<EOF
set -euo pipefail
$(printf 'APP_UUID=%q\n' "$APP_UUID")
$(printf 'APP_IMAGE=%q\n' "$APP_IMAGE")
$(printf 'ENV_COMPOSE=%q\n' "$ENV_COMPOSE")
$(printf 'IMAGE_NAME=%q\n' "$IMAGE_NAME")
$(printf 'IMAGE_TAG=%q\n' "$IMAGE_TAG")
$(printf 'COOLIFY_TOKEN=%q\n' "$COOLIFY_TOKEN")
API=http://127.0.0.1:8000/api/v1
CID=\$(docker ps --filter name=coolify-db --format '{{.ID}}' | head -1)
test -n "\$CID"
docker exec "\$CID" psql -U coolify -d coolify -v ON_ERROR_STOP=1 -c \
  "UPDATE environment_variables e
   SET value='\${APP_IMAGE}', updated_at=NOW()
   FROM applications a
   WHERE e.resourceable_id = a.id
     AND e.resourceable_type LIKE '%Application%'
     AND a.uuid = '\${APP_UUID}'
     AND e.key = 'APP_IMAGE'
     AND a.deleted_at IS NULL;"
test -f "\$ENV_COMPOSE"
python3 - "\$ENV_COMPOSE" "\$APP_IMAGE" <<'PY'
from pathlib import Path
import sys
path, image = Path(sys.argv[1]), sys.argv[2]
lines = [
    f"APP_IMAGE={image}" if line.startswith("APP_IMAGE=") else line
    for line in path.read_text().splitlines()
]
path.write_text("\\n".join(lines) + "\\n")
print("updated", path, "APP_IMAGE", image)
PY
if ! curl -fsS -X PATCH "\${API}/applications/\${APP_UUID}" \\
  -H "Authorization: Bearer \${COOLIFY_TOKEN}" \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json" \\
  -d "{\"docker_registry_image_name\":\"\${IMAGE_NAME}\",\"docker_registry_image_tag\":\"\${IMAGE_TAG}\"}" \\
  >/dev/null; then
  echo "warn: application registry PATCH failed (non-fatal)"
fi
curl -fsS -X POST "\${API}/deploy?uuid=\${APP_UUID}&force=true" \\
  -H "Authorization: Bearer \${COOLIFY_TOKEN}" \\
  -H "Accept: application/json"
echo
echo "Pinned and deploy requested for \${APP_IMAGE}"
EOF
