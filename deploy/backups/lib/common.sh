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
  # shellcheck disable=SC1090
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
  [[ -n "${S3_BUCKET:-}" ]] || die "S3_BUCKET is required"
  [[ -n "${S3_ENDPOINT:-}" ]] || die "S3_ENDPOINT is required"
  [[ -n "${S3_ACCESS_KEY_ID:-}" ]] || die "S3_ACCESS_KEY_ID is required"
  [[ -n "${S3_SECRET_ACCESS_KEY:-}" ]] || die "S3_SECRET_ACCESS_KEY is required"
  [[ -n "${AGE_RECIPIENT:-}" ]] || die "AGE_RECIPIENT is required (age public key)"
  EMAILHUB_ENV="${EMAILHUB_ENV:-dev}"
  S3_PREFIX="${S3_PREFIX:-backups/${EMAILHUB_ENV}}"
  S3_REGION="${S3_REGION:-fsn1}"
  WORK_DIR="${WORK_DIR:-/var/tmp/emailhub-backups}"
  mkdir -p "${WORK_DIR}"
  chmod 700 "${WORK_DIR}"
}

export_s3_aws_env() {
  export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}"
  export AWS_DEFAULT_REGION="${S3_REGION}"
  export AWS_EC2_METADATA_DISABLED=true
}

s3() {
  aws --endpoint-url "${S3_ENDPOINT}" s3 "$@"
}

s3api() {
  aws --endpoint-url "${S3_ENDPOINT}" s3api "$@"
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
  s3 cp "${local_path}" "s3://${S3_BUCKET}/${key}" --only-show-errors
  log "uploaded s3://${S3_BUCKET}/${key}"
}

list_prefix_keys() {
  local prefix="$1"
  s3api list-objects-v2 \
    --bucket "${S3_BUCKET}" \
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
    log "prune deleting s3://${S3_BUCKET}/${key}"
    s3 rm "s3://${S3_BUCKET}/${key}" --only-show-errors
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
