#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

load_backups_env
require_cmd curl
require_cmd jq

[[ -n "${HCLOUD_TOKEN:-}" ]] || die "HCLOUD_TOKEN is required"
SNAPSHOT_KEEP="${SNAPSHOT_KEEP:-4}"
STAMP="$(date +%Y%m%d)"
EMAILHUB_ENV="${EMAILHUB_ENV:-dev}"
DESC="emailhub-${EMAILHUB_ENV}-${STAMP}"
API="https://api.hetzner.cloud/v1"

hcloud() {
  local method="$1"
  local path="$2"
  shift 2
  curl -fsS -X "${method}" \
    -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@" \
    "${API}${path}"
}

resolve_server_id() {
  if [[ -n "${HCLOUD_SERVER_ID:-}" ]]; then
    printf '%s\n' "${HCLOUD_SERVER_ID}"
    return
  fi
  local hostname
  hostname="$(hostname -f 2>/dev/null || hostname)"
  local short="${hostname%%.*}"
  local id
  id="$(
    hcloud GET "/servers?per_page=50" |
      jq -r --arg h "${hostname}" --arg s "${short}" --arg n "${EMAILHUB_SERVER_NAME:-}" '
        .servers[]
        | select(
            .name == $h
            or .name == $s
            or ($n != "" and .name == $n)
          )
        | .id
      ' | head -1
  )"
  [[ -n "${id}" ]] || return 1
  printf '%s\n' "${id}"
}

SERVER_ID="$(resolve_server_id || true)"
[[ -n "${SERVER_ID}" ]] || die "could not resolve Hetzner server id; set HCLOUD_SERVER_ID"

log "server snapshot start id=${SERVER_ID} description=${DESC}"
hcloud POST "/servers/${SERVER_ID}/actions/create_image" \
  -d "{\"type\":\"snapshot\",\"description\":\"${DESC}\",\"labels\":{\"emailhub_env\":\"${EMAILHUB_ENV}\",\"managed_by\":\"emailhub-backups\"}}" \
  >/tmp/emailhub-snapshot-action.json
log "snapshot queued: $(jq -c '{action:(.action|{id,status,command}),image:(.image|{id,description,type})}' /tmp/emailhub-snapshot-action.json)"

mapfile -t SNAP_IDS < <(
  hcloud GET "/images?type=snapshot&per_page=50" |
    jq -r --arg p "emailhub-${EMAILHUB_ENV}-" --arg env "${EMAILHUB_ENV}" '
      [.images[]
        | select(
            (.description // "" | startswith($p))
            or ((.labels.emailhub_env // "") == $env)
          )
      ]
      | sort_by(.created) | reverse | .[].id
    '
)

total="${#SNAP_IDS[@]}"
if ((total > SNAPSHOT_KEEP)); then
  for ((i = SNAPSHOT_KEEP; i < total; i++)); do
    sid="${SNAP_IDS[$i]}"
    log "prune snapshot ${sid}"
    hcloud DELETE "/images/${sid}" >/dev/null || true
  done
fi

log "server snapshot complete"
