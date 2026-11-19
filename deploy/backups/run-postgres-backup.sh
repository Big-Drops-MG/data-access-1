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
export_s3_aws_env

PG_DAILY_KEEP="${PG_DAILY_KEEP:-30}"
PG_MONTHLY_KEEP="${PG_MONTHLY_KEEP:-12}"
DAY="$(utc_day)"
MONTH="$(utc_month)"
STAMP="$(utc_stamp)"
CONTAINER="${POSTGRES_CONTAINER:-$(find_container 'postgres')}"
DB_NAME="${POSTGRES_DB:-emailhub}"
DB_USER="${POSTGRES_USER:-postgres}"

RAW="${WORK_DIR}/postgres-${STAMP}.dump"
AGED="${RAW}.age"
DAILY_KEY="${S3_PREFIX}/postgres/daily/${DAY}.dump.age"
MONTHLY_KEY="${S3_PREFIX}/postgres/monthly/${MONTH}.dump.age"

cleanup() {
  rm -f "${RAW}" "${AGED}"
}
trap cleanup EXIT

log "postgres backup start container=${CONTAINER} db=${DB_NAME}"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}" \
  "${CONTAINER}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc --no-owner --no-acl >"${RAW}"
[[ -s "${RAW}" ]] || die "pg_dump produced empty file"

age_encrypt_file "${RAW}" "${AGED}"
upload_age_object "${AGED}" "${DAILY_KEY}"

if ! list_prefix_keys "${S3_PREFIX}/postgres/monthly/${MONTH}" | grep -q .; then
  upload_age_object "${AGED}" "${MONTHLY_KEY}"
fi

prune_prefix_keep_newest "${S3_PREFIX}/postgres/daily/" "${PG_DAILY_KEEP}"
prune_prefix_keep_newest "${S3_PREFIX}/postgres/monthly/" "${PG_MONTHLY_KEEP}"
log "postgres backup complete"
