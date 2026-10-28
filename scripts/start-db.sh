#!/usr/bin/env bash
# Makes sure the local Postgres is up before the server starts, and that the two roles
# the app expects exist. Safe to run every time — it does nothing when already listening.
#
# Postgres runs from Homebrew, not Docker. docker-compose.yml is kept for CI and for a
# machine without brew; nothing here uses it.
set -uo pipefail

PORT="${PGPORT:-5432}"
DB="${PGDATABASE:-nadlan}"

if nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; then
  echo "postgres: already listening on $PORT"
  exit 0
fi

BREW_PREFIX="$(brew --prefix 2>/dev/null || echo /opt/homebrew)"

# Newest first: the formula is versioned, so the bare name is not on PATH by default.
FORMULA=""
for v in 18 17 16 15; do
  if [ -x "$BREW_PREFIX/opt/postgresql@$v/bin/pg_ctl" ]; then
    FORMULA="postgresql@$v"
    PG_BIN="$BREW_PREFIX/opt/postgresql@$v/bin"
    break
  fi
done

if [ -z "$FORMULA" ]; then
  cat >&2 <<'MSG'
postgres: no Homebrew Postgres found.

  brew install postgresql@17
  npm run db

MSG
  exit 1
fi

echo "postgres: starting $FORMULA"
brew services start "$FORMULA" >/dev/null 2>&1

for _ in $(seq 1 30); do
  nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1 && break
  sleep 1
done

if ! nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; then
  echo "postgres: $FORMULA would not come up on $PORT" >&2
  echo "  check $BREW_PREFIX/var/log/$FORMULA.log" >&2
  exit 1
fi

# Homebrew makes your macOS account the superuser, so the roles the app connects as have
# to be created separately. `nadlan_app` is NOBYPASSRLS on purpose: it is the role
# row-level security actually applies to.
"$PG_BIN/psql" -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nadlan') THEN
    CREATE ROLE nadlan LOGIN PASSWORD 'nadlan' CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nadlan_app') THEN
    CREATE ROLE nadlan_app LOGIN PASSWORD 'nadlan_app' NOBYPASSRLS;
  END IF;
END $$;
SQL

"$PG_BIN/psql" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 \
  || "$PG_BIN/createdb" -O nadlan "$DB"

echo "postgres: ready on $PORT ($FORMULA)"
