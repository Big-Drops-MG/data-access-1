#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUPS_DIR="${REPO_ROOT}/deploy/backups"
DEV_ENV="${BACKUPS_ENV_FILE:-/etc/emailhub/backups.env}"
PROD_ENV="${BACKUPS_PROD_ENV_FILE:-/etc/emailhub/backups.prod.env}"
LOG_DIR="${BACKUP_LOG_DIR:-/var/log/emailhub-backups}"

[[ -x "${BACKUPS_DIR}/run-postgres-backup.sh" ]] || {
  echo "missing ${BACKUPS_DIR}/run-postgres-backup.sh" >&2
  exit 1
}
[[ -f "${DEV_ENV}" ]] || {
  echo "missing ${DEV_ENV}; copy .env.backups.example first" >&2
  exit 1
}

mkdir -p "${LOG_DIR}"
chmod 750 "${LOG_DIR}"

{
  cat <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""
# SD#13.8 — times are local server timezone (America/New_York).
# Dev
0 2 * * * root BACKUPS_ENV_FILE=${DEV_ENV} ${BACKUPS_DIR}/run-postgres-backup.sh >>${LOG_DIR}/postgres-dev.log 2>&1
30 2 * * * root BACKUPS_ENV_FILE=${DEV_ENV} ${BACKUPS_DIR}/run-clickhouse-backup.sh >>${LOG_DIR}/clickhouse-dev.log 2>&1
EOF
  if [[ -f "${PROD_ENV}" ]]; then
    cat <<EOF
# Prod (offset so dumps do not overlap)
15 2 * * * root BACKUPS_ENV_FILE=${PROD_ENV} ${BACKUPS_DIR}/run-postgres-backup.sh >>${LOG_DIR}/postgres-prod.log 2>&1
45 2 * * * root BACKUPS_ENV_FILE=${PROD_ENV} ${BACKUPS_DIR}/run-clickhouse-backup.sh >>${LOG_DIR}/clickhouse-prod.log 2>&1
EOF
  fi
  cat <<EOF
# Weekly server snapshot (shared host)
0 3 * * 0 root BACKUPS_ENV_FILE=${DEV_ENV} ${BACKUPS_DIR}/run-server-snapshot.sh >>${LOG_DIR}/snapshot.log 2>&1
EOF
} >/etc/cron.d/emailhub-backups
chmod 644 /etc/cron.d/emailhub-backups

echo "Installed /etc/cron.d/emailhub-backups"
echo "Dev env: ${DEV_ENV}"
if [[ -f "${PROD_ENV}" ]]; then
  echo "Prod env: ${PROD_ENV}"
else
  echo "Prod env missing (${PROD_ENV}); skipped prod cron rows"
fi
echo "Logs: ${LOG_DIR}"
