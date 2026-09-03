# Multi-stage build for apps/web.
#
# The workspace ships TypeScript source rather than built packages, so the
# build stage needs the whole workspace - packages/core and packages/adapters
# are compiled into the app by Next's transpilePackages.

# --- deps -------------------------------------------------------------------
FROM node:24-alpine AS deps
RUN corepack enable
WORKDIR /repo

# Only the manifests first, so a source-only change reuses the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/adapters/package.json packages/adapters/
COPY e2e/package.json e2e/

# The e2e package pulls Playwright, which is a ~400MB browser download this
# image has no use for.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

# --- build ------------------------------------------------------------------
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /repo/packages/adapters/node_modules ./packages/adapters/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @sig/web build

# --- runtime ----------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Don't run as root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Next's standalone output carries its own traced node_modules, so the runtime
# image needs neither pnpm nor the workspace.
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static

# The signing key lives on a mount shared with the host, so a document signed
# by `make sign` on the host verifies in the containerized app and vice versa.
RUN mkdir -p /app/keys && chown nextjs:nodejs /app/keys

USER nextjs
EXPOSE 3000

# Standalone keeps the workspace layout, so the server sits under apps/web.
CMD ["node", "apps/web/server.js"]
