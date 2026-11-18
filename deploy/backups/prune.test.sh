#!/usr/bin/env bash
# Local unit test for prune_prefix_keep_newest (no Spaces required).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

DELETED=()
list_prefix_keys() {
  printf '%s\n' \
    "backups/dev/postgres/daily/2026-11-01.dump.age" \
    "backups/dev/postgres/daily/2026-11-10.dump.age" \
    "backups/dev/postgres/daily/2026-11-18.dump.age"
}

s3() {
  if [[ "$1" == "rm" ]]; then
    DELETED+=("$2")
  fi
}

SPACES_BUCKET=test-bucket
prune_prefix_keep_newest "backups/dev/postgres/daily/" 2

[[ "${#DELETED[@]}" -eq 1 ]] || {
  echo "expected 1 delete, got ${#DELETED[@]}" >&2
  exit 1
}
[[ "${DELETED[0]}" == "s3://test-bucket/backups/dev/postgres/daily/2026-11-01.dump.age" ]] || {
  echo "unexpected delete target: ${DELETED[0]}" >&2
  exit 1
}

echo "prune.test.sh PASS"
