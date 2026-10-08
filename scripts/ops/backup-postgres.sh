#!/bin/sh
set -eu
umask 077

: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL to a direct PostgreSQL URL}"

validate_direct_url() {
  url=$1
  lower=$(printf '%s' "$url" | tr '[:upper:]' '[:lower:]')
  case "$lower" in
    postgresql://*|postgres://*) ;;
    *) printf 'BACKUP_DATABASE_URL must be a PostgreSQL URL\n' >&2; exit 1 ;;
  esac
  case "$lower" in
    *schema=*|*pgbouncer=*|*connection_limit=*|*pooled.db.prisma.io*)
      printf 'Refusing pooled or Prisma-only URL; use a direct libpq-compatible URL\n' >&2
      exit 1
      ;;
  esac
}

for command_name in pg_dump pg_restore; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf '%s is required\n' "$command_name" >&2
    exit 1
  }
done

validate_direct_url "$BACKUP_DATABASE_URL"
output=${1:-backup-$(date -u +%Y%m%dT%H%M%SZ).dump}
if [ -e "$output" ]; then
  printf 'Refusing to overwrite existing backup: %s\n' "$output" >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"
temporary=${output}.tmp.$$
cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT INT TERM

pg_dump \
  --dbname="$BACKUP_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$temporary"
test -s "$temporary"
pg_restore --list "$temporary" >/dev/null
mv "$temporary" "$output"
trap - EXIT INT TERM
printf 'Backup written to %s\n' "$output"
