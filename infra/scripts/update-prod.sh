#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage: infra/scripts/update-prod.sh [--env-file PATH] [--compose-file PATH] [TAG]
       infra/scripts/update-prod.sh [--env-file PATH] --list

Deploys the API and web images published by GitHub Actions on ghcr.io.

  TAG      main (default, the latest green build of main) or sha-xxxxxxx
           (a specific commit, also used to roll back).
  --list   Shows the deploy history and the versions available on this server.

Steps: pull the images, back up PostgreSQL, write the version into the env
file, then run deploy-prod.sh (migrations, restart, health checks). Volumes
are never removed. Old local images beyond the last KEEP_LOCAL_IMAGES deploys
are untagged.

Environment:
  IMAGE_PREFIX         Default: ghcr.io/littlefly1969/performancefactory
  KEEP_LOCAL_IMAGES    Default: 3
  BACKUP_DIR           Default: backups (next to the env file)
  BACKUP_KEEP          Default: 5
  SKIP_BACKUP=1        Skips the PostgreSQL backup.
USAGE
}

ENV_FILE=".env.production"
COMPOSE_FILE="infra/docker-compose.prod.example.yml"
TAG=""
LIST=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --list)
      LIST=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [ -n "$TAG" ]; then
        echo "Only one TAG is allowed." >&2
        exit 2
      fi
      TAG="$1"
      shift
      ;;
  esac
done

TAG="${TAG:-main}"
case "$TAG" in
  *[!A-Za-z0-9_.-]*|-*)
    echo "Invalid image tag: $TAG" >&2
    exit 2
    ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not available in PATH." >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ENV_DIR="$(CDPATH= cd -- "$(dirname -- "$ENV_FILE")" && pwd)"
IMAGE_PREFIX="${IMAGE_PREFIX:-ghcr.io/littlefly1969/performancefactory}"
API_REPO="$IMAGE_PREFIX-api"
WEB_REPO="$IMAGE_PREFIX-web"
KEEP_LOCAL_IMAGES="${KEEP_LOCAL_IMAGES:-3}"
BACKUP_DIR="${BACKUP_DIR:-$ENV_DIR/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-5}"
HISTORY_FILE="${DEPLOY_HISTORY_FILE:-$ENV_DIR/.deploy-history}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

# Replaces KEY=... in the env file (or appends it), keeping its permissions.
set_env_value() {
  tmp="$ENV_FILE.tmp.$$"
  awk -v key="$1" -v value="$2" '
    BEGIN { done = 0 }
    index($0, key "=") == 1 { if (!done) print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

# Most recent deployed tags first, without duplicates.
recent_tags() {
  if [ -f "$HISTORY_FILE" ]; then
    awk '{ print $2 }' "$HISTORY_FILE" | sed -n '1!G;h;$p' | awk 'NF && !seen[$0]++'
  fi
}

if [ "$LIST" -eq 1 ]; then
  echo "Running version: $(env_value IMAGE_TAG)"
  echo
  echo "Deploy history (latest last):"
  if [ -f "$HISTORY_FILE" ]; then
    tail -n 20 "$HISTORY_FILE"
  else
    echo "  (empty)"
  fi
  echo
  echo "Images available on this server:"
  docker image ls "$API_REPO"
  docker image ls "$WEB_REPO"
  exit 0
fi

PREVIOUS_TAG="$(env_value IMAGE_TAG)"

echo "Pulling $API_REPO:$TAG and $WEB_REPO:$TAG..."
docker pull "$API_REPO:$TAG"
docker pull "$WEB_REPO:$TAG"

revision_of() {
  docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$1"
}

API_REVISION="$(revision_of "$API_REPO:$TAG")"
WEB_REVISION="$(revision_of "$WEB_REPO:$TAG")"
if [ "$API_REVISION" != "$WEB_REVISION" ]; then
  echo "API ($API_REVISION) and web ($WEB_REVISION) come from different commits." >&2
  echo "A new build is probably being published: retry in a few minutes." >&2
  exit 1
fi

# Pin the commit tag, so the env file never points to the moving "main" tag.
RELEASE_TAG="$TAG"
case "$TAG" in
  sha-*) ;;
  *)
    case "$API_REVISION" in
      ''|'<no value>') ;;
      *)
        RELEASE_TAG="sha-$(printf '%.7s' "$API_REVISION")"
        docker tag "$API_REPO:$TAG" "$API_REPO:$RELEASE_TAG"
        docker tag "$WEB_REPO:$TAG" "$WEB_REPO:$RELEASE_TAG"
        ;;
    esac
    ;;
esac
echo "Version to deploy: $RELEASE_TAG (running now: ${PREVIOUS_TAG:-none})"

if [ "${SKIP_BACKUP:-0}" != "1" ] && compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/pf-$(date -u +%Y%m%dT%H%M%SZ)-before-$RELEASE_TAG.dump"
  echo "Backing up PostgreSQL to $BACKUP_FILE..."
  compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_FILE.part"
  mv "$BACKUP_FILE.part" "$BACKUP_FILE"
  chmod 600 "$BACKUP_FILE"
  ls -1t "$BACKUP_DIR"/pf-*.dump | tail -n +"$((BACKUP_KEEP + 1))" | while IFS= read -r old; do
    rm -f "$old"
  done
fi

cp -p "$ENV_FILE" "$ENV_FILE.bak"
set_env_value IMAGE_TAG "$RELEASE_TAG"
set_env_value API_IMAGE "$API_REPO:$RELEASE_TAG"
set_env_value WEB_IMAGE "$WEB_REPO:$RELEASE_TAG"

if ! DEPLOY_MODE=none sh "$SCRIPT_DIR/deploy-prod.sh" --env-file "$ENV_FILE" --compose-file "$COMPOSE_FILE"; then
  echo >&2
  echo "Deploy of $RELEASE_TAG failed." >&2
  if [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$RELEASE_TAG" ]; then
    echo "To go back to the previous version run:" >&2
    echo "  infra/scripts/update-prod.sh --env-file $ENV_FILE $PREVIOUS_TAG" >&2
  fi
  exit 1
fi

printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$RELEASE_TAG" >> "$HISTORY_FILE"

KEEP_TAGS="$(recent_tags | head -n "$KEEP_LOCAL_IMAGES")"
for repo in "$API_REPO" "$WEB_REPO"; do
  docker image ls --format '{{.Tag}}' "$repo" | while IFS= read -r tag; do
    [ -n "$tag" ] || continue
    [ "$tag" = "<none>" ] && continue
    [ "$tag" = "$RELEASE_TAG" ] && continue
    if printf '%s\n' "$KEEP_TAGS" | grep -qx -- "$tag"; then
      continue
    fi
    docker rmi "$repo:$tag" >/dev/null 2>&1 || true
  done
done

echo
echo "Deployed $RELEASE_TAG."
