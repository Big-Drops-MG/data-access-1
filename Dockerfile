ARG NODE_VERSION=24.10.0
ARG ALPINE_VERSION=3.22
ARG PNPM_VERSION=11.25.0

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=true \
    HUSKY=0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY vitest.shared.ts vitest.config.ts vitest.int.config.ts ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm turbo build --filter=@workspace/email-hub --filter=@workspace/worker
RUN pnpm --filter=@workspace/worker deploy --prod --legacy /out/worker \
    && printf '%s\n' "import './dist/index.js'" > /out/worker/index.js

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
RUN apk add --no-cache libc6-compat \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs appuser
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=appuser:nodejs /app/apps/email-hub/.next/standalone ./
COPY --from=builder --chown=appuser:nodejs /app/apps/email-hub/.next/static ./apps/email-hub/.next/static
COPY --from=builder --chown=appuser:nodejs /app/apps/email-hub/public ./apps/email-hub/public
COPY --from=builder --chown=appuser:nodejs /out/worker ./apps/worker

USER appuser
EXPOSE 3000


CMD ["node", "apps/email-hub/server.js"]
