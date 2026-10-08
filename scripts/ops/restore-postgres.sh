#!/bin/sh
set -eu
umask 077

: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a direct PostgreSQL URL}"
: "${CONFIRM_RESTORE_DATABASE:?Set CONFIRM_RESTORE_DATABASE to the exact target database name}"

validate_direct_url() {
  url=$1
  lower=$(printf '%s' "$url" | tr '[:upper:]' '[:lower:]')
  case "$lower" in
    postgresql://*|postgres://*) ;;
    *) printf 'RESTORE_DATABASE_URL must be a PostgreSQL URL\n' >&2; exit 1 ;;
  esac
  case "$lower" in
    *schema=*|*pgbouncer=*|*connection_limit=*|*pooled.db.prisma.io*)
      printf 'Refusing pooled or Prisma-only URL; use a direct libpq-compatible URL\n' >&2
      exit 1
      ;;
  esac
}

for command_name in psql pg_restore; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf '%s is required\n' "$command_name" >&2
    exit 1
  }
done

validate_direct_url "$RESTORE_DATABASE_URL"
input=${1:?Usage: RESTORE_DATABASE_URL=... CONFIRM_RESTORE_DATABASE=... $0 <backup.dump>}
if [ ! -f "$input" ] || [ ! -s "$input" ]; then
  printf 'Backup archive is missing or empty: %s\n' "$input" >&2
  exit 1
fi
pg_restore --list "$input" >/dev/null

url_without_query=${RESTORE_DATABASE_URL%%\?*}
database_name=${url_without_query##*/}
if [ -z "$database_name" ] || [ "$CONFIRM_RESTORE_DATABASE" != "$database_name" ]; then
  printf 'Confirmation must exactly match target database: %s\n' "$database_name" >&2
  exit 1
fi

user_object_count=$(psql "$RESTORE_DATABASE_URL" --no-psqlrc --tuples-only --no-align --command="SELECT (SELECT count(*) FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema', 'public')) + (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) + (SELECT count(*) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype IN ('d', 'e')) + (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public');")
if [ "$user_object_count" != "0" ]; then
  printf 'Refusing restore: target database is not empty (%s user objects)\n' "$user_object_count" >&2
  exit 1
fi

printf 'Restoring archive into empty database %s\n' "$database_name"
pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --single-transaction \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  "$input"
printf 'Restore completed into %s\n' "$database_name"
