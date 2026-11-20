#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

load_backups_env
load_compose_db_env
require_backup_config
require_cmd docker
require_cmd age
require_cmd aws
require_cmd tar
export_s3_aws_env

CH_DAILY_KEEP="${CH_DAILY_KEEP:-14}"
CH_BACKUP_IMAGE="${CH_BACKUP_IMAGE:-altinity/clickhouse-backup:2.6.24}"
DAY="$(utc_day)"
STAMP="$(utc_stamp)"
CONTAINER="${CLICKHOUSE_CONTAINER:-$(find_container 'clickhouse')}"
CH_USER="${CLICKHOUSE_USER:-default}"
CH_PASSWORD="${CLICKHOUSE_PASSWORD:?CLICKHOUSE_PASSWORD required}"
BACKUP_NAME="ch-${STAMP}"
LOCAL_DIR="${WORK_DIR}/clickhouse-${STAMP}"
TAR_PATH="${LOCAL_DIR}.tar.gz"
AGED="${TAR_PATH}.age"
DAILY_KEY="${S3_PREFIX}/clickhouse/daily/${DAY}.tar.gz.age"
CFG_DIR="${LOCAL_DIR}/cfg"
CH_DATA_DIR="${CLICKHOUSE_DATA_DIR:-/data/clickhouse}"
BACKUP_DIR="${CH_DATA_DIR}/backup/${BACKUP_NAME}"

cleanup() {
  rm -rf "${LOCAL_DIR}" "${TAR_PATH}" "${AGED}"
}
trap cleanup EXIT

mkdir -p "${CFG_DIR}"
chmod 700 "${LOCAL_DIR}"

log "clickhouse backup start container=${CONTAINER} name=${BACKUP_NAME}"

cat >"${CFG_DIR}/config.yml" <<EOF
general:
  remote_storage: none
  backups_to_keep_local: 1
  log_level: info
  disable_progress_bar: true
clickhouse:
  host: 127.0.0.1
  port: 9000
  username: ${CH_USER}
  password: "${CH_PASSWORD}"
  timeout: 10m
  data_path: /var/lib/clickhouse
EOF

docker run --rm \
  --network "container:${CONTAINER}" \
  -v "${CH_DATA_DIR}:/var/lib/clickhouse" \
  -v "${CFG_DIR}:/etc/clickhouse-backup:ro" \
  -e CLICKHOUSE_BACKUP_CONFIG=/etc/clickhouse-backup/config.yml \
  "${CH_BACKUP_IMAGE}" \
  create "${BACKUP_NAME}"

[[ -d "${BACKUP_DIR}" ]] || die "clickhouse-backup create did not produce ${BACKUP_DIR}"

tar -C "${CH_DATA_DIR}/backup" -czf "${TAR_PATH}" "${BACKUP_NAME}"
[[ -s "${TAR_PATH}" ]] || die "clickhouse archive empty"

age_encrypt_file "${TAR_PATH}" "${AGED}"
upload_age_object "${AGED}" "${DAILY_KEY}"
prune_prefix_keep_newest "${S3_PREFIX}/clickhouse/daily/" "${CH_DAILY_KEEP}"

docker run --rm \
  --network "container:${CONTAINER}" \
  -v "${CH_DATA_DIR}:/var/lib/clickhouse" \
  -v "${CFG_DIR}:/etc/clickhouse-backup:ro" \
  -e CLICKHOUSE_BACKUP_CONFIG=/etc/clickhouse-backup/config.yml \
  "${CH_BACKUP_IMAGE}" \
  delete local "${BACKUP_NAME}" >/dev/null 2>&1 || true

log "clickhouse backup complete"
