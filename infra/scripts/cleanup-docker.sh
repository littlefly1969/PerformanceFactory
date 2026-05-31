#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage: infra/scripts/cleanup-docker.sh --env-file PATH [--compose-file PATH]

Environment:
  CONFIRM_DOCKER_CLEANUP=true   Required unless DRY_RUN=true
  DRY_RUN=true                  Print planned actions without changing Docker state
  PRUNE_BUILD_CACHE=true        Also prune dangling build cache

This script only targets the configured Compose project and dangling Docker
artifacts. It never prunes volumes and never deletes database or Redis volumes.
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

COMPOSE="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE"
$COMPOSE config >/dev/null
PROJECT="$($COMPOSE config | sed -n 's/^name: //p' | head -n 1)"

if [ -z "$PROJECT" ]; then
  PROJECT="$(basename "$(pwd)")"
fi

DRY_RUN="${DRY_RUN:-false}"
CONFIRM_DOCKER_CLEANUP="${CONFIRM_DOCKER_CLEANUP:-false}"
PRUNE_BUILD_CACHE="${PRUNE_BUILD_CACHE:-false}"

echo "Compose project: $PROJECT"
echo "This cleanup will:"
echo "- remove stopped containers labeled com.docker.compose.project=$PROJECT"
echo "- prune dangling images"
echo "- never prune volumes"
echo "- never delete named Redis or database volumes"
if [ "$PRUNE_BUILD_CACHE" = "true" ]; then
  echo "- prune dangling build cache"
fi

echo
echo "Stopped project containers:"
docker ps -a \
  --filter "label=com.docker.compose.project=$PROJECT" \
  --filter "status=exited" \
  --format "  {{.ID}} {{.Names}} {{.Status}}" || true

echo
echo "Dangling images:"
docker images --filter dangling=true --format "  {{.ID}} {{.Repository}}:{{.Tag}} {{.Size}}" || true

if [ "$DRY_RUN" = "true" ]; then
  echo
  echo "DRY_RUN=true, no cleanup executed."
  exit 0
fi

if [ "$CONFIRM_DOCKER_CLEANUP" != "true" ]; then
  echo
  echo "Refusing to clean up without CONFIRM_DOCKER_CLEANUP=true." >&2
  exit 2
fi

echo
echo "Removing stopped containers for project $PROJECT..."
CONTAINERS="$(docker ps -a -q --filter "label=com.docker.compose.project=$PROJECT" --filter "status=exited")"
if [ -n "$CONTAINERS" ]; then
  docker rm $CONTAINERS
else
  echo "No stopped project containers to remove."
fi

echo "Pruning dangling images..."
docker image prune -f

if [ "$PRUNE_BUILD_CACHE" = "true" ]; then
  echo "Pruning dangling build cache..."
  docker builder prune -f
fi

echo "Cleanup complete. Volumes were not pruned."
