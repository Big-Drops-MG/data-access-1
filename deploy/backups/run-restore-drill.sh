#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

load_backups_env
require_backup_config
require_cmd docker
require_cmd age
require_cmd aws
require_cmd tar
export_s3_aws_env

[[ -n "${AGE_IDENTITY_FILE:-}" ]] || die "AGE_IDENTITY_FILE is required (path to age private key)"
[[ -f "${AGE_IDENTITY_FILE}" ]] || die "AGE_IDENTITY_FILE not found: ${AGE_IDENTITY_FILE}"

START_EPOCH="$(date +%s)"
STAMP="$(utc_stamp)"
DRILL_DIR="${WORK_DIR}/restore-drill-${STAMP}"
PG_CONTAINER="emailhub-restore-pg-${STAMP}"
CH_CONTAINER="emailhub-restore-ch-${STAMP}"
PG_IMAGE="${RESTORE_PG_IMAGE:-postgres:18-bookworm}"
CH_IMAGE="${RESTORE_CH_IMAGE:-clickhouse:26.8}"
CH_BACKUP_IMAGE="${CH_BACKUP_IMAGE:-altinity/clickhouse-backup:2.6.24}"
PG_PASS="$(openssl rand -hex 16)"
NETWORK="emailhub-restore-${STAMP}"

cleanup() {
  docker rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
  docker rm -f "${CH_CONTAINER}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
  rm -rf "${DRILL_DIR}"
}
trap cleanup EXIT

mkdir -p "${DRILL_DIR}"
chmod 700 "${DRILL_DIR}"
docker network create "${NETWORK}" >/dev/null

latest_key() {
  local prefix="$1"
  list_prefix_keys "${prefix}" | sort | tail -1
}

age_decrypt_file() {
  local src="$1"
  local dst="$2"
  age -d -i "${AGE_IDENTITY_FILE}" -o "${dst}" "${src}"
  chmod 600 "${dst}"
}

log "restore drill start env=${EMAILHUB_ENV} prefix=${S3_PREFIX}"

PG_KEY="$(latest_key "${S3_PREFIX}/postgres/daily/")"
[[ -n "${PG_KEY}" ]] || die "no postgres daily backups under ${S3_PREFIX}/postgres/daily/"
CH_KEY="$(latest_key "${S3_PREFIX}/clickhouse/daily/")"
[[ -n "${CH_KEY}" ]] || die "no clickhouse daily backups under ${S3_PREFIX}/clickhouse/daily/"

PG_AGED="${DRILL_DIR}/postgres.dump.age"
CH_AGED="${DRILL_DIR}/clickhouse.tar.gz.age"
PG_DUMP="${DRILL_DIR}/postgres.dump"
CH_TAR="${DRILL_DIR}/clickhouse.tar.gz"
CH_EXTRACT="${DRILL_DIR}/clickhouse-extract"

log "downloading postgres ${PG_KEY}"
s3 cp "s3://${S3_BUCKET}/${PG_KEY}" "${PG_AGED}" --only-show-errors
age_decrypt_file "${PG_AGED}" "${PG_DUMP}"

log "starting throwaway postgres ${PG_CONTAINER}"
docker run -d \
  --name "${PG_CONTAINER}" \
  --network "${NETWORK}" \
  -e POSTGRES_PASSWORD="${PG_PASS}" \
  -e POSTGRES_DB=emailhub \
  "${PG_IMAGE}" >/dev/null

for _ in $(seq 1 60); do
  if docker exec -e PGPASSWORD="${PG_PASS}" "${PG_CONTAINER}" \
    pg_isready -U postgres -d emailhub >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec -e PGPASSWORD="${PG_PASS}" "${PG_CONTAINER}" \
  pg_isready -U postgres -d emailhub >/dev/null

log "pg_restore into ${PG_CONTAINER}"
docker cp "${PG_DUMP}" "${PG_CONTAINER}:/tmp/restore.dump"
docker exec -e PGPASSWORD="${PG_PASS}" "${PG_CONTAINER}" \
  pg_restore -U postgres -d emailhub --no-owner --no-acl /tmp/restore.dump \
  || true

PG_TABLES="$(docker exec -e PGPASSWORD="${PG_PASS}" "${PG_CONTAINER}" \
  psql -U postgres -d emailhub -Atc "select count(*) from information_schema.tables where table_schema='public'")"
[[ "${PG_TABLES}" -gt 0 ]] || die "postgres restore produced zero public tables"
log "postgres restore ok tables=${PG_TABLES}"

log "downloading clickhouse ${CH_KEY}"
s3 cp "s3://${S3_BUCKET}/${CH_KEY}" "${CH_AGED}" --only-show-errors
age_decrypt_file "${CH_AGED}" "${CH_TAR}"
mkdir -p "${CH_EXTRACT}"
tar -C "${CH_EXTRACT}" -xzf "${CH_TAR}"
BACKUP_NAME="$(find "${CH_EXTRACT}" -maxdepth 2 -mindepth 1 -type d | head -1 | xargs -I{} basename {} || true)"
[[ -n "${BACKUP_NAME}" ]] || die "clickhouse archive had no backup directory"

CH_DATA="${DRILL_DIR}/ch-data"
CFG_DIR="${DRILL_DIR}/ch-cfg"
mkdir -p "${CH_DATA}/backup" "${CFG_DIR}"
cp -a "${CH_EXTRACT}/${BACKUP_NAME}" "${CH_DATA}/backup/"

cat >"${CFG_DIR}/config.yml" <<EOF
general:
  remote_storage: none
  backups_to_keep_local: 1
  log_level: warn
  disable_progress_bar: true
clickhouse:
  host: 127.0.0.1
  port: 9000
  username: default
  password: ""
  timeout: 10m
  data_path: /var/lib/clickhouse
EOF

log "starting throwaway clickhouse ${CH_CONTAINER}"
docker run -d \
  --name "${CH_CONTAINER}" \
  --network "${NETWORK}" \
  -v "${CH_DATA}:/var/lib/clickhouse" \
  -e CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1 \
  "${CH_IMAGE}" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "${CH_CONTAINER}" clickhouse-client -q "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "${CH_CONTAINER}" clickhouse-client -q "SELECT 1" >/dev/null

docker run --rm \
  --network "container:${CH_CONTAINER}" \
  -v "${CH_DATA}:/var/lib/clickhouse" \
  -v "${CFG_DIR}:/etc/clickhouse-backup:ro" \
  -e CLICKHOUSE_BACKUP_CONFIG=/etc/clickhouse-backup/config.yml \
  "${CH_BACKUP_IMAGE}" \
  restore --rm "${BACKUP_NAME}"

CH_DBS="$(docker exec "${CH_CONTAINER}" clickhouse-client -q "SELECT count() FROM system.databases WHERE name NOT IN ('system','INFORMATION_SCHEMA','information_schema')")"
[[ "${CH_DBS}" -gt 0 ]] || die "clickhouse restore produced zero user databases"
log "clickhouse restore ok databases=${CH_DBS}"

END_EPOCH="$(date +%s)"
ELAPSED="$((END_EPOCH - START_EPOCH))"
ELAPSED_H="$(awk "BEGIN { printf \"%.2f\", ${ELAPSED}/3600 }")"

printf '%s\n' "{"
printf '  "result": "PASS",\n'
printf '  "emailhub_env": "%s",\n' "${EMAILHUB_ENV}"
printf '  "postgres_key": "%s",\n' "${PG_KEY}"
printf '  "clickhouse_key": "%s",\n' "${CH_KEY}"
printf '  "postgres_public_tables": %s,\n' "${PG_TABLES}"
printf '  "clickhouse_user_databases": %s,\n' "${CH_DBS}"
printf '  "elapsed_seconds": %s,\n' "${ELAPSED}"
printf '  "elapsed_hours": %s,\n' "${ELAPSED_H}"
printf '  "rto_hours_budget": 4,\n'
printf '  "within_rto": %s\n' "$([[ "${ELAPSED}" -lt 14400 ]] && echo true || echo false)"
printf '%s\n' "}"

[[ "${ELAPSED}" -lt 14400 ]] || die "restore exceeded 4h RTO (${ELAPSED}s)"
log "restore drill complete within RTO"
