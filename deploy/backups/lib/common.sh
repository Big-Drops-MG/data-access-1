set -euo pipefail

BACKUPS_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUPS_ROOT_DIR="$(cd "${BACKUPS_LIB_DIR}/.." && pwd)"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

load_backups_env() {
  local env_file="${BACKUPS_ENV_FILE:-/etc/emailhub/backups.env}"
  if [[ -f "${env_file}" ]]; then
    set -a
    source "${env_file}"
    set +a
  fi
}

compose_env_file() {
  if [[ -n "${COMPOSE_ENV_FILE:-}" && -f "${COMPOSE_ENV_FILE}" ]]; then
    printf '%s\n' "${COMPOSE_ENV_FILE}"
    return
  fi
  case "${EMAILHUB_ENV:-dev}" in
    prod | production)
      printf '%s\n' "/opt/emailhub/.env.compose"
      ;;
    *)
      if [[ -f /opt/emailhub-dev/.env.compose ]]; then
        printf '%s\n' "/opt/emailhub-dev/.env.compose"
      else
        printf '%s\n' "/opt/emailhub/.env.compose"
      fi
      ;;
  esac
}

load_compose_db_env() {
  local env_file
  env_file="$(compose_env_file)"
  [[ -f "${env_file}" ]] || die "compose env not found: ${env_file}"
  set -a
  source "${env_file}"
  set +a
}

find_container() {
  local pattern="$1"
  local name
  name="$(docker ps --format '{{.Names}}' | grep -E "${pattern}" | head -1 || true)"
  [[ -n "${name}" ]] || die "no running container matching /${pattern}/"
  printf '%s\n' "${name}"
}

require_backup_config() {
  [[ -n "${SPACES_BUCKET:-}" ]] || die "SPACES_BUCKET is required"
  [[ -n "${SPACES_ENDPOINT:-}" ]] || die "SPACES_ENDPOINT is required"
  [[ -n "${SPACES_ACCESS_KEY_ID:-}" ]] || die "SPACES_ACCESS_KEY_ID is required"
  [[ -n "${SPACES_SECRET_ACCESS_KEY:-}" ]] || die "SPACES_SECRET_ACCESS_KEY is required"
  [[ -n "${AGE_RECIPIENT:-}" ]] || die "AGE_RECIPIENT is required (age public key)"
  EMAILHUB_ENV="${EMAILHUB_ENV:-dev}"
  SPACES_PREFIX="${SPACES_PREFIX:-backups/${EMAILHUB_ENV}}"
  SPACES_REGION="${SPACES_REGION:-sfo3}"
  WORK_DIR="${WORK_DIR:-/var/tmp/emailhub-backups}"
  mkdir -p "${WORK_DIR}"
  chmod 700 "${WORK_DIR}"
}

export_spaces_aws_env() {
  export AWS_ACCESS_KEY_ID="${SPACES_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${SPACES_SECRET_ACCESS_KEY}"
  export AWS_DEFAULT_REGION="${SPACES_REGION}"
  export AWS_EC2_METADATA_DISABLED=true
}

s3() {
  aws --endpoint-url "${SPACES_ENDPOINT}" s3 "$@"
}

s3api() {
  aws --endpoint-url "${SPACES_ENDPOINT}" s3api "$@"
}

age_encrypt_file() {
  local src="$1"
  local dst="$2"
  age -r "${AGE_RECIPIENT}" -o "${dst}" "${src}"
  chmod 600 "${dst}"
}

upload_age_object() {
  local local_path="$1"
  local key="$2"
  s3 cp "${local_path}" "s3://${SPACES_BUCKET}/${key}" \
    --only-show-errors \
    --sse AES256
  log "uploaded s3://${SPACES_BUCKET}/${key}"
}

list_prefix_keys() {
  local prefix="$1"
  s3api list-objects-v2 \
    --bucket "${SPACES_BUCKET}" \
    --prefix "${prefix}" \
    --query 'Contents[].Key' \
    --output text 2>/dev/null | tr '\t' '\n' | sed '/^None$/d' | sed '/^$/d' || true
}

prune_prefix_keep_newest() {
  local prefix="$1"
  local keep="$2"
  local keys
  mapfile -t keys < <(list_prefix_keys "${prefix}" | sort -r)
  local total="${#keys[@]}"
  if ((total <= keep)); then
    log "prune ${prefix}: ${total} object(s), keep ${keep} — nothing to delete"
    return 0
  fi
  local i
  for ((i = keep; i < total; i++)); do
    local key="${keys[$i]}"
    [[ -n "${key}" ]] || continue
    log "prune deleting s3://${SPACES_BUCKET}/${key}"
    s3 rm "s3://${SPACES_BUCKET}/${key}" --only-show-errors
  done
}

utc_stamp() {
  date -u +%Y%m%dT%H%M%SZ
}

utc_day() {
  date -u +%Y-%m-%d
}

utc_month() {
  date -u +%Y-%m
}
