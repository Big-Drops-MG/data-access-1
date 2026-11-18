#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUPS_DIR="${REPO_ROOT}/deploy/backups"
ENV_FILE="${BACKUPS_ENV_FILE:-/etc/emailhub/backups.env}"
LOG_DIR="${BACKUP_LOG_DIR:-/var/log/emailhub-backups}"

[[ -x "${BACKUPS_DIR}/run-postgres-backup.sh" ]] || {
  echo "missing ${BACKUPS_DIR}/run-postgres-backup.sh" >&2
  exit 1
}
[[ -f "${ENV_FILE}" ]] || {
  echo "missing ${ENV_FILE}; copy .env.backups.example first" >&2
  exit 1
}

mkdir -p "${LOG_DIR}"
chmod 750 "${LOG_DIR}"

cat >/etc/cron.d/emailhub-backups <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""
# SD#13.8 — times are local server timezone (America/New_York).
0 2 * * * root BACKUPS_ENV_FILE=${ENV_FILE} ${BACKUPS_DIR}/run-postgres-backup.sh >>${LOG_DIR}/postgres.log 2>&1
30 2 * * * root BACKUPS_ENV_FILE=${ENV_FILE} ${BACKUPS_DIR}/run-clickhouse-backup.sh >>${LOG_DIR}/clickhouse.log 2>&1
0 3 * * 0 root BACKUPS_ENV_FILE=${ENV_FILE} ${BACKUPS_DIR}/run-server-snapshot.sh >>${LOG_DIR}/snapshot.log 2>&1
EOF
chmod 644 /etc/cron.d/emailhub-backups

echo "Installed /etc/cron.d/emailhub-backups"
echo "Logs: ${LOG_DIR}"
