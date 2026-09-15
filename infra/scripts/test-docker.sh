#!/usr/bin/env sh
set -eu

compose() {
  docker compose --project-name "${TEST_COMPOSE_PROJECT_NAME:-performancefactory-test}" -f infra/docker-compose.test.yml "$@"
}
cleanup() {
  compose down --remove-orphans
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
compose config --quiet
compose up --build --abort-on-container-exit --exit-code-from api-tests
