#!/usr/bin/env sh
set -eu

ENV_FILE="${1:-.env.docker}"
if [ -e "$ENV_FILE" ]; then
  echo "Keeping existing $ENV_FILE"
  exit 0
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
command -v openssl >/dev/null 2>&1 || { echo 'openssl is required' >&2; exit 1; }
umask 077
TEMP_FILE="$(mktemp "${ENV_FILE}.XXXXXX")"
trap 'rm -f "$TEMP_FILE"' EXIT HUP INT TERM
sed \
  -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" \
  -e "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" \
  -e "s/^ACCESS_TOKEN_SECRET=.*/ACCESS_TOKEN_SECRET=$(openssl rand -hex 32)/" \
  "$SCRIPT_DIR/../.env.docker.example" > "$TEMP_FILE"
# A hard link creates the destination atomically and refuses to overwrite it.
ln "$TEMP_FILE" "$ENV_FILE"
echo "Created $ENV_FILE with dedicated local Docker settings and generated secrets."
