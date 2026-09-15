FROM node:26.8.2-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
ADD --checksum=sha256:afa99b0b4b3d11c1dad2b472f9318ae2c78673829749ded527f89f09071479a7 https://registry.npmjs.org/pnpm/-/pnpm-10.28.2.tgz /tmp/pnpm.tgz
RUN mkdir -p /pnpm && tar -xzf /tmp/pnpm.tgz -C /pnpm --strip-components=1 && rm /tmp/pnpm.tgz
RUN ln -s /pnpm/bin/pnpm.cjs /usr/local/bin/pnpm

FROM base AS deps
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter web...

FROM deps AS build
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN pnpm run build

FROM node:26.8.2-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
CMD ["node", "apps/web/server.js"]
