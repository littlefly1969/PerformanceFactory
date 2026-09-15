#!/usr/bin/env sh
set -eu

ENV_FILE="${1:-.env.docker}"
infra/scripts/init-docker-env.sh "$ENV_FILE"
exec infra/scripts/deploy-prod.sh --env-file "$ENV_FILE"
