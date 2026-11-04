
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:?PG_CONTAINER is required}"
EMAILHUB_OWNER_PASSWORD="${EMAILHUB_OWNER_PASSWORD:?EMAILHUB_OWNER_PASSWORD is required}"
EMAILHUB_APP_PASSWORD="${EMAILHUB_APP_PASSWORD:?EMAILHUB_APP_PASSWORD is required}"
EMAILHUB_DB="${EMAILHUB_DB:-emailhub}"

sql_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

OWNER_LIT="$(sql_literal "$EMAILHUB_OWNER_PASSWORD")"
APP_LIT="$(sql_literal "$EMAILHUB_APP_PASSWORD")"
PW="$(docker exec "$PG_CONTAINER" printenv POSTGRES_PASSWORD)"

psql_db() {
  local db="$1"
  shift
  docker exec -e PGPASSWORD="$PW" "$PG_CONTAINER" \
    psql -U postgres -v ON_ERROR_STOP=1 -d "$db" -c "$*"
}

echo "Terminating other sessions on ${EMAILHUB_DB} (needed for REASSIGN OWNED)..."
psql_db "$EMAILHUB_DB" \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${EMAILHUB_DB}' AND pid <> pg_backend_pid();" \
  >/dev/null || true

echo "Ensuring owner role emailhub..."
OWNER_EXISTS="$(
  docker exec -e PGPASSWORD="$PW" "$PG_CONTAINER" \
    psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='emailhub'"
)"
if [ "$OWNER_EXISTS" = "1" ]; then
  psql_db postgres \
    "ALTER ROLE emailhub WITH LOGIN NOSUPERUSER CREATEDB CREATEROLE INHERIT PASSWORD '${OWNER_LIT}';"
else
  psql_db postgres \
    "CREATE ROLE emailhub WITH LOGIN NOSUPERUSER CREATEDB CREATEROLE INHERIT PASSWORD '${OWNER_LIT}';"
fi

echo "Ensuring application role emailhub_app..."
APP_EXISTS="$(
  docker exec -e PGPASSWORD="$PW" "$PG_CONTAINER" \
    psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='emailhub_app'"
)"
if [ "$APP_EXISTS" = "1" ]; then
  psql_db postgres \
    "ALTER ROLE emailhub_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION PASSWORD '${APP_LIT}';"
else
  psql_db postgres \
    "CREATE ROLE emailhub_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION PASSWORD '${APP_LIT}';"
fi

psql_db postgres "GRANT ALL PRIVILEGES ON DATABASE ${EMAILHUB_DB} TO emailhub;"
psql_db postgres "ALTER DATABASE ${EMAILHUB_DB} OWNER TO emailhub;"
psql_db postgres "GRANT CONNECT ON DATABASE ${EMAILHUB_DB} TO emailhub_app;"

echo "Reassigning objects owned by emailhub_app to emailhub..."
psql_db "$EMAILHUB_DB" "REASSIGN OWNED BY emailhub_app TO emailhub;"
psql_db "$EMAILHUB_DB" "ALTER SCHEMA public OWNER TO emailhub;"

echo "Granting application privileges..."
psql_db "$EMAILHUB_DB" "GRANT USAGE ON SCHEMA public TO emailhub_app;"
psql_db "$EMAILHUB_DB" "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO emailhub_app;"
psql_db "$EMAILHUB_DB" "REVOKE ALL ON TABLE public.audit_log FROM emailhub_app;"
psql_db "$EMAILHUB_DB" "GRANT SELECT, INSERT ON TABLE public.audit_log TO emailhub_app;"
psql_db "$EMAILHUB_DB" "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO emailhub_app;"
psql_db "$EMAILHUB_DB" \
  "ALTER DEFAULT PRIVILEGES FOR ROLE emailhub IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO emailhub_app;"
psql_db "$EMAILHUB_DB" \
  "ALTER DEFAULT PRIVILEGES FOR ROLE emailhub IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO emailhub_app;"
psql_db "$EMAILHUB_DB" "ALTER ROLE emailhub_app SET search_path = public;"

echo "Verifying logins..."
docker exec -e PGPASSWORD="$EMAILHUB_OWNER_PASSWORD" "$PG_CONTAINER" \
  psql -U emailhub -d "$EMAILHUB_DB" -tAc "SELECT current_user || '@' || current_database()"
docker exec -e PGPASSWORD="$EMAILHUB_APP_PASSWORD" "$PG_CONTAINER" \
  psql -U emailhub_app -d "$EMAILHUB_DB" -tAc "SELECT current_user || '@' || current_database()"

echo "Coolify Postgres roles aligned."
