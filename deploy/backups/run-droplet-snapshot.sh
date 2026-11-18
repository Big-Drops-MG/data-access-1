#!/usr/bin/env bash
# Weekly DigitalOcean droplet snapshot (SD#13.8). Keep 4.
# Schedule: Sunday 03:00 America/New_York (before unattended reboot 04:00).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

load_backups_env
require_cmd curl
require_cmd jq

[[ -n "${DO_API_TOKEN:-}" ]] || die "DO_API_TOKEN is required"
SNAPSHOT_KEEP="${SNAPSHOT_KEEP:-4}"
STAMP="$(date +%Y%m%d)"
EMAILHUB_ENV="${EMAILHUB_ENV:-dev}"
NAME="emailhub-${EMAILHUB_ENV}-${STAMP}"

resolve_droplet_id() {
  if [[ -n "${DO_DROPLET_ID:-}" ]]; then
    printf '%s\n' "${DO_DROPLET_ID}"
    return
  fi
  local hostname
  hostname="$(hostname -f 2>/dev/null || hostname)"
  curl -fsS -H "Authorization: Bearer ${DO_API_TOKEN}" \
    "https://api.digitalocean.com/v2/droplets?per_page=200" |
    jq -r --arg h "${hostname}" '
      .droplets[]
      | select(.name == $h or (.networks.v4[]?.ip_address != null))
      | "\(.id)\t\(.name)"
    ' | while IFS=$'\t' read -r id name; do
      if [[ "${name}" == "${hostname}" || "${name}" == "${hostname%%.*}" ]]; then
        printf '%s\n' "${id}"
        return 0
      fi
    done
  # Fallback: exact EMAILHUB_DROPLET_NAME match
  if [[ -n "${EMAILHUB_DROPLET_NAME:-}" ]]; then
    curl -fsS -H "Authorization: Bearer ${DO_API_TOKEN}" \
      "https://api.digitalocean.com/v2/droplets?per_page=200" |
      jq -r --arg n "${EMAILHUB_DROPLET_NAME}" '.droplets[] | select(.name==$n) | .id' |
      head -1
  fi
}

DROPLET_ID="$(resolve_droplet_id || true)"
[[ -n "${DROPLET_ID}" ]] || die "could not resolve droplet id; set DO_DROPLET_ID"

log "droplet snapshot start id=${DROPLET_ID} name=${NAME}"
curl -fsS -X POST \
  -H "Authorization: Bearer ${DO_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"snapshot\",\"name\":\"${NAME}\"}" \
  "https://api.digitalocean.com/v2/droplets/${DROPLET_ID}/actions" \
  >/tmp/emailhub-snapshot-action.json
log "snapshot action queued: $(jq -c '{id,status,type}' /tmp/emailhub-snapshot-action.json)"

# Prune older EmailHub snapshots for this env, keep newest SNAPSHOT_KEEP.
mapfile -t SNAP_IDS < <(
  curl -fsS -H "Authorization: Bearer ${DO_API_TOKEN}" \
    "https://api.digitalocean.com/v2/snapshots?resource_type=droplet&per_page=200" |
    jq -r --arg p "emailhub-${EMAILHUB_ENV}-" '
      [.snapshots[] | select(.name | startswith($p))]
      | sort_by(.created_at) | reverse | .[].id
    '
)

total="${#SNAP_IDS[@]}"
if ((total > SNAPSHOT_KEEP)); then
  for ((i = SNAPSHOT_KEEP; i < total; i++)); do
    sid="${SNAP_IDS[$i]}"
    log "prune snapshot ${sid}"
    curl -fsS -X DELETE -H "Authorization: Bearer ${DO_API_TOKEN}" \
      "https://api.digitalocean.com/v2/snapshots/${sid}" >/dev/null
  done
fi

log "droplet snapshot complete"
