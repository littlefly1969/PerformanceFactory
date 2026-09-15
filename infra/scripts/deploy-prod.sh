#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage: infra/scripts/deploy-prod.sh --env-file PATH [--compose-file PATH]

Environment:
  DEPLOY_MODE=build|pull   Default: build

The script validates the production Compose config, builds or pulls images,
starts PostgreSQL/Redis, applies migrations, and waits for healthy API/web.
It does not prune images or volumes.
USAGE
}

ENV_FILE=""
COMPOSE_FILE="infra/docker-compose.prod.example.yml"

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
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$ENV_FILE" ]; then
  echo "Missing required --env-file PATH." >&2
  usage >&2
  exit 2
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not available in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin is not available." >&2
  exit 1
fi

DEPLOY_MODE="${DEPLOY_MODE:-build}"
case "$DEPLOY_MODE" in
  build|pull) ;;
  *)
    echo "DEPLOY_MODE must be build or pull, got: $DEPLOY_MODE" >&2
    exit 2
    ;;
esac

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "Validating Compose configuration..."
compose config >/dev/null

if [ "$DEPLOY_MODE" = "pull" ]; then
  echo "Pulling configured images..."
  compose pull
else
  echo "Building application images..."
  compose build api web
fi

echo "Starting services and removing orphan containers for this Compose project..."
compose up -d --remove-orphans --wait --wait-timeout "${DEPLOY_WAIT_TIMEOUT:-180}"

echo "Service status:"
compose ps

echo "Recent service logs:"
compose logs --tail=80 api web redis migrate
