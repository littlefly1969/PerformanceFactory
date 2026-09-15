FROM node:26.8.2-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:afa99b0b4b3d11c1dad2b472f9318ae2c78673829749ded527f89f09071479a7 https://registry.npmjs.org/pnpm/-/pnpm-10.28.2.tgz /tmp/pnpm.tgz
RUN mkdir -p /pnpm && tar -xzf /tmp/pnpm.tgz -C /pnpm --strip-components=1 && rm /tmp/pnpm.tgz
RUN ln -s /pnpm/bin/pnpm.cjs /usr/local/bin/pnpm

FROM base AS deps
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter api...

FROM deps AS build
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN pnpm exec prisma generate --generator client
RUN pnpm run build

FROM build AS test
CMD ["pnpm", "test:db"]

FROM node:26.8.2-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PATH="/app/apps/api/node_modules/.bin:/app/node_modules/.bin:$PATH"
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
WORKDIR /app/apps/api
CMD ["node", "dist/src/main.js"]
