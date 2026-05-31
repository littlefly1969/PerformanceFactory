# Production Deployment

This deployment path is for production Docker Compose. It keeps development and
production concerns separate: no source bind mounts, explicit images, bounded
container logs, healthchecks, and named persistent volumes.

## Architecture

- `web`: Next.js standalone server, published to the host on
  `WEB_HOST_BIND:WEB_HOST_PORT`.
- `api`: NestJS API, published to the host on `API_HOST_BIND:API_HOST_PORT`.
- `redis`: self-hosted Redis for sessions/cache, only reachable on the internal
  Compose backend network.
- PostgreSQL is expected to be external by default through `DATABASE_URL`.

The production Compose file does not expose PostgreSQL or Redis to the host.
If production ever self-hosts PostgreSQL, add it as a deliberate follow-up with
a named data volume and backup/restore runbook.

## Files

- Compose: `infra/docker-compose.prod.example.yml`
- Env example: `infra/.env.prod.example`
- Deploy script: `infra/scripts/deploy-prod.sh`
- Cleanup script: `infra/scripts/cleanup-docker.sh`

Copy the env example to a real server-local file and protect it:

```bash
cp infra/.env.prod.example .env.production
chmod 600 .env.production
```

Never commit real secrets.

## Required Environment

Set these values before first deploy:

```text
IMAGE_TAG
API_IMAGE
WEB_IMAGE
WEB_ORIGIN
NEXT_PUBLIC_API_BASE_URL
DATABASE_URL
SESSION_SECRET
ACCESS_TOKEN_SECRET
REDIS_URL
SWAGGER_ENABLED=false
```

`IMAGE_TAG` provides the default tag for `performancefactory-api` and
`performancefactory-web`. `API_IMAGE` and `WEB_IMAGE` can override the full image
name, including registry and tag. Do not use `latest` for production unless a
separate release policy makes that intentional.

## First Deploy

Validate the config:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml config
```

Build local server images and start services:

```bash
infra/scripts/deploy-prod.sh --env-file .env.production
```

Use registry images instead:

```bash
DEPLOY_MODE=pull infra/scripts/deploy-prod.sh --env-file .env.production
```

Database migrations are not run automatically by the deploy script. Apply them
only as a deliberate release step after backups and review:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy
```

## Normal Deploy

1. Update `API_IMAGE` and `WEB_IMAGE` tags in `.env.production`, or rebuild with
   the current tags if this host builds images locally.
2. Run `docker compose ... config`.
3. Run `infra/scripts/deploy-prod.sh --env-file .env.production`.
4. Check health and logs.

The deploy script uses `up -d --remove-orphans`, so containers removed from the
Compose file are stopped and removed for the configured project.

## Health

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml ps
curl -fsS "http://${API_HOST_BIND:-127.0.0.1}:${API_HOST_PORT:-4000}/api/health"
curl -fsSI "http://${WEB_HOST_BIND:-127.0.0.1}:${WEB_HOST_PORT:-3000}/login"
```

Compose healthchecks cover API, web, and Redis. `api` waits for healthy Redis;
`web` waits for healthy API.

## Logs

The Compose file uses the `json-file` driver with rotation:

```text
DOCKER_LOG_MAX_SIZE=10m
DOCKER_LOG_MAX_FILE=5
```

Inspect logs without changing retention:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=200 api
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=200 web
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=200 redis
```

Do not enable `AI_DEBUG_PROMPT_LOG=true` in production unless a privacy review
has approved the temporary exposure.

## Persistent Volumes

`redis-data` is persistent. It must not be deleted by routine cleanup.

Do not run:

```bash
docker volume prune
docker compose down --volumes
```

Before any destructive database operation, take and verify a database backup.
This repository does not currently provide a production DB backup script.

## Safe Cleanup

Dry run:

```bash
DRY_RUN=true infra/scripts/cleanup-docker.sh --env-file .env.production
```

Execute guarded cleanup:

```bash
CONFIRM_DOCKER_CLEANUP=true infra/scripts/cleanup-docker.sh --env-file .env.production
```

Also prune dangling build cache:

```bash
CONFIRM_DOCKER_CLEANUP=true PRUNE_BUILD_CACHE=true \
  infra/scripts/cleanup-docker.sh --env-file .env.production
```

The cleanup script removes stopped containers belonging to the Compose project
and prunes dangling images. It never prunes volumes.

## Rollback

Keep the previous `API_IMAGE` and `WEB_IMAGE` tags available. To roll back:

1. Restore the previous image tags in `.env.production`.
2. Run `infra/scripts/deploy-prod.sh --env-file .env.production` with the same
   `DEPLOY_MODE` used for normal deploys.
3. Check `ps`, health endpoints, and recent logs.

Schema migrations are not automatically reversible. Treat releases with Prisma
migrations as forward-only unless a tested rollback plan exists.

## Stop And Start

Stop services without deleting volumes:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml stop
```

Start them again:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml up -d
```

Avoid `down` during routine operations unless you intentionally want to remove
the project network and stopped containers. Never use `down --volumes`.

## Troubleshooting

Old containers:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml up -d --remove-orphans
docker ps -a --filter label=com.docker.compose.project=performancefactory
```

Logs consuming disk:

```bash
docker inspect --format '{{json .HostConfig.LogConfig}}' performancefactory-api-1
docker system df
```

Failed healthchecks:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml ps
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=200 api
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=200 web
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml logs --tail=200 redis
```

Failed migrations:

- Stop the release.
- Keep the current database intact.
- Inspect Prisma output and application logs.
- Restore from a verified backup only if the database owner explicitly decides
  that rollback is safer than a forward fix.

Port conflicts:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml config
ss -ltnp | grep -E ':3000|:4000'
```

Change `WEB_HOST_PORT`, `API_HOST_PORT`, `WEB_HOST_BIND`, or `API_HOST_BIND` in
the env file and redeploy.
