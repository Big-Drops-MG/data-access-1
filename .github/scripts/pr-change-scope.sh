#!/usr/bin/env bash
# Resolve which PR checks to run from files changed vs the PR base SHA.
set -euo pipefail

BASE_SHA="${1:-}"
if [[ -z "$BASE_SHA" ]]; then
  echo "usage: pr-change-scope.sh <base-sha>" >&2
  exit 2
fi

if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  echo "Base SHA ${BASE_SHA} is not available locally; fetching..."
  git fetch --no-tags --depth=1 origin "${BASE_SHA}" || true
fi

mapfile -t CHANGED < <(
  git diff --name-only --diff-filter=ACMRTUXB "${BASE_SHA}...HEAD" | sed '/^$/d'
)

echo "Changed files vs ${BASE_SHA} (${#CHANGED[@]}):"
if ((${#CHANGED[@]} == 0)); then
  echo "  (none)"
else
  printf '  %s\n' "${CHANGED[@]}"
fi

matches_prefix() {
  local prefix=$1
  local path
  for path in "${CHANGED[@]:-}"; do
    if [[ "$path" == "$prefix"* ]]; then
      return 0
    fi
  done
  return 1
}

path_equals() {
  local target=$1
  local path
  for path in "${CHANGED[@]:-}"; do
    if [[ "$path" == "$target" ]]; then
      return 0
    fi
  done
  return 1
}

full=false
if path_equals "pnpm-lock.yaml" \
  || path_equals "package.json" \
  || path_equals "turbo.json" \
  || path_equals "eslint.config.js" \
  || path_equals "vitest.config.ts" \
  || path_equals "vitest.shared.ts" \
  || path_equals "vitest.int.config.ts" \
  || path_equals "vitest.workers.config.ts" \
  || matches_prefix ".github/workflows/" \
  || matches_prefix "packages/config/"; then
  full=true
fi

prettier_files=()
for path in "${CHANGED[@]:-}"; do
  if [[ "$path" =~ \.(js|jsx|ts|tsx|mjs|cjs|json|md|yml|yaml|css)$ ]]; then
    prettier_files+=("$path")
  fi
done

run_turbo=false
run_prettier=false
run_unit=false
run_coverage=false
run_db_int=false
run_workers_int=false

if [[ "$full" == true ]]; then
  run_turbo=true
  run_prettier=true
  run_unit=false
  run_coverage=true
  run_db_int=true
  run_workers_int=true
else
  if matches_prefix "apps/" || matches_prefix "packages/" || matches_prefix "infra/"; then
    run_turbo=true
  fi

  if ((${#prettier_files[@]} > 0)); then
    run_prettier=true
  fi

  if matches_prefix "packages/shared/" \
    || matches_prefix "apps/worker/" \
    || matches_prefix "apps/email-hub/src/lib/" \
    || matches_prefix "apps/email-hub/src/app/api/"; then
    # Coverage re-runs the unit suite with instrumentation + package thresholds.
    run_coverage=true
  elif matches_prefix "apps/" || matches_prefix "packages/" || matches_prefix "infra/"; then
    run_unit=true
  fi

  if matches_prefix "packages/db/"; then
    run_db_int=true
    run_workers_int=true
  fi

  if matches_prefix "apps/worker/" \
    || matches_prefix "packages/shared/" \
    || matches_prefix "packages/emails/"; then
    run_workers_int=true
  fi
fi

TURBO_FILTER="...[${BASE_SHA}]"
PRETTIER_LIST_FILE="${RUNNER_TEMP:-/tmp}/pr-prettier-files.txt"
: >"$PRETTIER_LIST_FILE"
if ((${#prettier_files[@]} > 0)); then
  printf '%s\n' "${prettier_files[@]}" >"$PRETTIER_LIST_FILE"
fi

echo "Scope: full=${full} turbo=${run_turbo} prettier=${run_prettier} unit=${run_unit} coverage=${run_coverage} db_int=${run_db_int} workers_int=${run_workers_int}"
echo "turbo filter: ${TURBO_FILTER}"
echo "prettier list: ${PRETTIER_LIST_FILE} ($(wc -l <"$PRETTIER_LIST_FILE" | tr -d ' ') files)"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "base_sha=${BASE_SHA}"
    echo "full=${full}"
    echo "turbo_filter=${TURBO_FILTER}"
    echo "run_turbo=${run_turbo}"
    echo "run_prettier=${run_prettier}"
    echo "run_unit=${run_unit}"
    echo "run_coverage=${run_coverage}"
    echo "run_db_int=${run_db_int}"
    echo "run_workers_int=${run_workers_int}"
    echo "prettier_list_file=${PRETTIER_LIST_FILE}"
  } >>"$GITHUB_OUTPUT"
fi
