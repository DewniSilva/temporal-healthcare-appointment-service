FROM node:20.19.5-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

# Separate production-only install: `npm prune --omit=dev` after a full `npm
# ci` is unreliable (a known npm bug can leave devDependencies like esbuild's
# vendored native binary behind), so the runtime node_modules comes from a
# clean `npm ci --omit=dev` instead.
FROM node:20.19.5-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20.19.5-bookworm-slim AS runtime
# apt-get upgrade patches OS packages the pinned base image tag has since had
# security fixes for; npm is self-updated because the base image's bundled
# npm CLI carries its own outdated, vulnerable dependencies (tar, minimatch,
# glob, etc.) that a plain OS package upgrade doesn't touch.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* && npm install -g npm@11
ENV NODE_ENV=production
ARG VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Temporal Healthcare Appointment Service" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$VCS_REF
WORKDIR /app
COPY --from=deps --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=deps --chown=node:node /app/prisma ./prisma
USER node
EXPOSE 3000 9464 9465
CMD ["npm", "start"]
